import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { CreateCartDto } from './dto/create-cart.dto';
import { UpdateCartDto } from './dto/update-cart.dto';
import { PrismaService } from '../database/database.service';
import { PaginationDto } from '../common/dto/pagination.dto';

@Injectable()
export class CartService {
  constructor(private readonly prisma: PrismaService) {}

  private readonly cartInclude = {
    user: true,
    coupon: true,
    items: {
      // attributes + category permiten que la web mapee el producto completo
      // (badges de tueste/origen/categoría) al sincronizar el carrito.
      // `cost` se omite SIEMPRE: el carrito es de cara al cliente y el costo es admin-only.
      include: {
        product: { include: { attributes: true, category: true }, omit: { cost: true } },
      },
    },
  } as const;

  private async findOrCreateByUserId(userId: string) {
    const existing = await this.prisma.cart.findUnique({
      where: { userId },
      include: this.cartInclude,
    });

    if (existing) return existing;

    return this.prisma.cart.create({
      data: { userId },
      include: this.cartInclude,
    });
  }

  private async getValidCouponByCode(code: string) {
    const coupon = await this.prisma.coupon.findUnique({
      where: { code },
      include: { couponProducts: true },
    });

    if (!coupon) throw new NotFoundException(`Cupón con código ${code} no encontrado`);
    if (!coupon.isActive) throw new BadRequestException('El cupón está inactivo');
    if (coupon.expiryDate && coupon.expiryDate < new Date())
      throw new BadRequestException('El cupón está vencido');
    if (coupon.usageLimit !== null && coupon.usageCount >= coupon.usageLimit)
      throw new BadRequestException('El cupón alcanzó su límite de uso');

    return coupon;
  }

  create(createCartDto: CreateCartDto) {
    const { userId, productId, quantity, couponId } = createCartDto;

    return this.prisma.cart.create({
      data: {
        userId,
        couponId,
        items: productId
          ? { create: { productId, quantity: quantity ?? 1 } }
          : undefined,
      },
      include: this.cartInclude,
    });
  }

  async findAll({ limit, offset }: PaginationDto) {
    const [data, total] = await this.prisma.$transaction([
      this.prisma.cart.findMany({ include: this.cartInclude, take: limit, skip: offset }),
      this.prisma.cart.count(),
    ]);
    return { data, total, limit, offset };
  }

  async findOne(id: string) {
    const cart = await this.prisma.cart.findUnique({
      where: { id },
      include: this.cartInclude,
    });

    if (!cart) throw new NotFoundException(`Carrito con id ${id} no encontrado`);
    return cart;
  }

  async update(id: string, updateCartDto: UpdateCartDto) {
    await this.findOne(id);
    return this.prisma.cart.update({
      where: { id },
      data: { userId: updateCartDto.userId, couponId: updateCartDto.couponId },
      include: this.cartInclude,
    });
  }

  async findByUserId(userId: string) {
    return this.findOrCreateByUserId(userId);
  }

  async addProduct(userId: string, productId: string, quantity = 1) {
    const cart = await this.findOrCreateByUserId(userId);
    const safeQty = quantity > 0 ? quantity : 1;

    const existing = await this.prisma.cartItem.findFirst({
      where: { cartId: cart.id, productId },
    });

    if (existing) {
      await this.prisma.cartItem.update({
        where: { id: existing.id },
        data: { quantity: existing.quantity + safeQty },
      });
    } else {
      await this.prisma.cartItem.create({
        data: { cartId: cart.id, productId, quantity: safeQty },
      });
    }

    return this.findOne(cart.id);
  }

  async updateItemQuantity(userId: string, productId: string, quantity: number) {
    const cart = await this.findOrCreateByUserId(userId);

    if (quantity <= 0) {
      await this.prisma.cartItem.deleteMany({ where: { cartId: cart.id, productId } });
      return this.findOne(cart.id);
    }

    const existing = await this.prisma.cartItem.findFirst({
      where: { cartId: cart.id, productId },
    });

    if (!existing) {
      await this.prisma.cartItem.create({
        data: { cartId: cart.id, productId, quantity },
      });
    } else {
      await this.prisma.cartItem.update({
        where: { id: existing.id },
        data: { quantity },
      });
    }

    return this.findOne(cart.id);
  }

  async removeProduct(userId: string, productId: string) {
    const cart = await this.findOrCreateByUserId(userId);
    await this.prisma.cartItem.deleteMany({ where: { cartId: cart.id, productId } });
    return this.findOne(cart.id);
  }

  async replaceItems(userId: string, items: Array<{ productId: string; quantity: number }>) {
    const cart = await this.findOrCreateByUserId(userId);

    await this.prisma.cart.update({
      where: { id: cart.id },
      data: {
        items: {
          deleteMany: {},
          create: items
            .filter((i) => i.quantity > 0)
            .map(({ productId, quantity }) => ({ productId, quantity })),
        },
      },
    });

    return this.findOne(cart.id);
  }

  async clearByUser(userId: string) {
    const cart = await this.findOrCreateByUserId(userId);
    await this.prisma.cartItem.deleteMany({ where: { cartId: cart.id } });
    return this.findOne(cart.id);
  }

  async applyCoupon(userId: string, couponCode: string) {
    const cart = await this.findOrCreateByUserId(userId);
    const coupon = await this.getValidCouponByCode(couponCode);

    const allowedProductIds = coupon.couponProducts.map((cp) => cp.productId);
    if (allowedProductIds.length) {
      const cartProductIds = cart.items.map((i) => i.productId);
      const invalid = cartProductIds.filter((id) => !allowedProductIds.includes(id));
      if (invalid.length) {
        throw new BadRequestException(
          `El cupón no aplica a los siguientes productos: ${invalid.join(', ')}`,
        );
      }
    }

    return this.prisma.cart.update({
      where: { id: cart.id },
      data: { couponId: coupon.id },
      include: this.cartInclude,
    });
  }

  async removeCoupon(userId: string) {
    const cart = await this.findOrCreateByUserId(userId);
    return this.prisma.cart.update({
      where: { id: cart.id },
      data: { couponId: null },
      include: this.cartInclude,
    });
  }

  async remove(id: string) {
    await this.findOne(id);
    return this.prisma.cart.delete({ where: { id } });
  }
}
