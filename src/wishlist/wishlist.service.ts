import { Injectable, NotFoundException } from '@nestjs/common';
import { CreateWishlistDto } from './dto/create-wishlist.dto';
import { UpdateWishlistDto } from './dto/update-wishlist.dto';
import { PrismaService } from '../database/database.service';
import { PaginationDto } from '../common/dto/pagination.dto';

@Injectable()
export class WishlistService {
  constructor(private readonly prisma: PrismaService) {}

  private readonly wishlistInclude = {
    user: true,
    items: {
      include: {
        // attributes + category para que la web renderice la ficha completa
        // del producto (ProductCard) directamente desde la base de datos.
        product: { include: { attributes: true, category: true } },
      },
    },
  } as const;

  private async findOrCreateByUserId(userId: string) {
    const existing = await this.prisma.wishlist.findUnique({
      where: { userId },
      include: this.wishlistInclude,
    });

    if (existing) {
      return existing;
    }

    return this.prisma.wishlist.create({
      data: { userId },
      include: this.wishlistInclude,
    });
  }

  create(createWishlistDto: CreateWishlistDto) {
    const { userId, productId } = createWishlistDto;

    return this.prisma.wishlist.create({
      data: {
        userId,
        items: productId
          ? {
              create: {
                productId,
              },
            }
          : undefined,
      },
      include: this.wishlistInclude,
    });
  }

  async findAll({ limit, offset }: PaginationDto) {
    const [data, total] = await this.prisma.$transaction([
      this.prisma.wishlist.findMany({
        include: this.wishlistInclude,
        take: limit,
        skip: offset,
      }),
      this.prisma.wishlist.count(),
    ]);
    return { data, total, limit, offset };
  }

  async findOne(id: string) {
    const wishlist = await this.prisma.wishlist.findUnique({
      where: { id },
      include: this.wishlistInclude,
    });

    if (!wishlist) {
      throw new NotFoundException(`Wishlist with id ${id} not found`);
    }

    return wishlist;
  }

  async update(id: string, updateWishlistDto: UpdateWishlistDto) {
    await this.findOne(id);

    const { userId } = updateWishlistDto;
    return this.prisma.wishlist.update({
      where: { id },
      data: {
        userId,
      },
      include: this.wishlistInclude,
    });
  }

  async findByUserId(userId: string) {
    return this.findOrCreateByUserId(userId);
  }

  async addProduct(userId: string, productId: string) {
    const wishlist = await this.findOrCreateByUserId(userId);

    await this.prisma.wishlistItem.upsert({
      where: {
        wishlistId_productId: {
          wishlistId: wishlist.id,
          productId,
        },
      },
      update: {},
      create: {
        wishlistId: wishlist.id,
        productId,
      },
    });

    return this.findOne(wishlist.id);
  }

  async removeProduct(userId: string, productId: string) {
    const wishlist = await this.findOrCreateByUserId(userId);

    await this.prisma.wishlistItem.deleteMany({
      where: {
        wishlistId: wishlist.id,
        productId,
      },
    });

    return this.findOne(wishlist.id);
  }

  async replaceItems(userId: string, productIds: string[]) {
    const wishlist = await this.findOrCreateByUserId(userId);

    await this.prisma.wishlist.update({
      where: { id: wishlist.id },
      data: {
        items: {
          deleteMany: {},
          create: productIds.map((productId) => ({ productId })),
        },
      },
    });

    return this.findOne(wishlist.id);
  }

  async remove(id: string) {
    await this.findOne(id);

    return this.prisma.wishlist.delete({
      where: { id },
    });
  }
}
