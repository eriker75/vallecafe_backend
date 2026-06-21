import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { CreateCouponDto } from './dto/create-coupon.dto';
import { UpdateCouponDto } from './dto/update-coupon.dto';
import { PrismaService } from '../database/database.service';
import { PaginationDto } from '../common/dto/pagination.dto';
import { buildOrderBy } from '../common/sort/build-order-by';
import { BulkImportDto } from '../common/dto/bulk-import.dto';
import {
  runBulkImport,
  validateAgainstDto,
  type BulkResult,
} from '../common/bulk/bulk-import.helper';

// Columnas ordenables desde la tabla de cupones del admin (cabeceras clickeables).
const COUPON_SORT_COLUMNS: Record<
  string,
  (dir: Prisma.SortOrder) => Prisma.CouponOrderByWithRelationInput
> = {
  code: (dir) => ({ code: dir }),
  type: (dir) => ({ discountType: dir }),
  amount: (dir) => ({ amount: dir }),
  active: (dir) => ({ isActive: dir }),
  expiryDate: (dir) => ({ expiryDate: dir }),
  usage: (dir) => ({ usageCount: dir }),
};

@Injectable()
export class CouponsService {
  constructor(private readonly prisma: PrismaService) {}

  private readonly couponInclude = {
    couponProducts: {
      include: {
        product: true,
      },
    },
  } as const;

  create(createCouponDto: CreateCouponDto) {
    const { allowedProductIds, expiryDate, ...couponData } = createCouponDto;

    return this.prisma.coupon.create({
      data: {
        ...couponData,
        expiryDate: expiryDate ? new Date(expiryDate) : undefined,
        couponProducts: allowedProductIds?.length
          ? {
              create: allowedProductIds.map((productId) => ({
                productId,
              })),
            }
          : undefined,
      },
      include: this.couponInclude,
    });
  }

  async findAll({ limit, offset, sortBy, order }: PaginationDto) {
    const orderBy = buildOrderBy(sortBy, order, COUPON_SORT_COLUMNS, {
      createdAt: 'desc',
    });

    const [data, total] = await this.prisma.$transaction([
      this.prisma.coupon.findMany({
        include: this.couponInclude,
        orderBy,
        take: limit,
        skip: offset,
      }),
      this.prisma.coupon.count(),
    ]);
    return { data, total, limit, offset };
  }

  async findOne(id: string) {
    const coupon = await this.prisma.coupon.findUnique({
      where: { id },
      include: this.couponInclude,
    });

    if (!coupon) {
      throw new NotFoundException(`Coupon with id ${id} not found`);
    }

    return coupon;
  }

  // Validación pública de un cupón por código (carrito/checkout). Devuelve los
  // datos necesarios para que la web calcule el descuento. El descuento real se
  // RE-CALCULA en el servidor al hacer checkout (ver OrdersService.createCheckout);
  // este endpoint sólo es para previsualizar/validar en la UI.
  async validateForCart(code: string, productIds: string[] = []) {
    const coupon = await this.prisma.coupon.findUnique({
      where: { code },
      include: { couponProducts: true },
    });

    if (!coupon) throw new NotFoundException(`Cupón "${code}" no encontrado`);
    if (!coupon.isActive) throw new BadRequestException('El cupón está inactivo');
    if (coupon.expiryDate && coupon.expiryDate < new Date())
      throw new BadRequestException('El cupón está vencido');
    if (coupon.usageLimit !== null && coupon.usageCount >= coupon.usageLimit)
      throw new BadRequestException('El cupón alcanzó su límite de uso');

    const allowedProductIds = coupon.couponProducts.map((cp) => cp.productId);
    if (allowedProductIds.length && productIds.length) {
      const invalid = productIds.filter((id) => !allowedProductIds.includes(id));
      if (invalid.length)
        throw new BadRequestException('El cupón no aplica a algunos productos del carrito');
    }

    return {
      id: coupon.id,
      code: coupon.code,
      discountType: coupon.discountType,
      amount: coupon.amount,
      allowedProductIds,
    };
  }

  async update(id: string, updateCouponDto: UpdateCouponDto) {
    await this.findOne(id);

    const { allowedProductIds, expiryDate, ...couponData } = updateCouponDto;
    return this.prisma.coupon.update({
      where: { id },
      data: {
        ...couponData,
        expiryDate: expiryDate ? new Date(expiryDate) : undefined,
        couponProducts: allowedProductIds
          ? {
              deleteMany: {},
              create: allowedProductIds.map((productId) => ({ productId })),
            }
          : undefined,
      },
      include: this.couponInclude,
    });
  }

  async remove(id: string) {
    await this.findOne(id);

    return this.prisma.coupon.delete({
      where: { id },
    });
  }

  // Importación masiva desde CSV. Clave única para duplicados: `code` (@unique).
  // No se importa `allowedProductIds` (relación de productos) por CSV.
  async bulkImport({ mode, rows }: BulkImportDto): Promise<BulkResult> {
    return runBulkImport<CreateCouponDto>(rows, mode, {
      prepare: (raw) =>
        validateAgainstDto(CreateCouponDto, {
          code: raw.code,
          discountType: raw.discountType,
          amount: raw.amount,
          ...(raw.isActive != null && raw.isActive !== ''
            ? { isActive: raw.isActive }
            : {}),
          ...(raw.expiryDate != null && raw.expiryDate !== ''
            ? { expiryDate: raw.expiryDate }
            : {}),
          ...(raw.usageLimit != null && raw.usageLimit !== ''
            ? { usageLimit: raw.usageLimit }
            : {}),
        }),
      findExisting: (row) =>
        this.prisma.coupon.findUnique({ where: { code: row.code } }),
      create: (row) => this.create(row),
      update: (existing, row) =>
        this.update((existing as { id: string }).id, row),
    });
  }
}
