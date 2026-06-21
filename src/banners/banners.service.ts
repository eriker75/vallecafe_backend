import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { CreateBannerDto } from './dto/create-banner.dto';
import { UpdateBannerDto } from './dto/update-banner.dto';
import { PrismaService } from '../database/database.service';
import { PaginationDto } from '../common/dto/pagination.dto';
import { buildOrderBy } from '../common/sort/build-order-by';
import { BulkImportDto } from '../common/dto/bulk-import.dto';
import {
  runBulkImport,
  validateAgainstDto,
  type BulkResult,
} from '../common/bulk/bulk-import.helper';

// Columnas ordenables desde la tabla de banners del admin (cabeceras clickeables).
const BANNER_SORT_COLUMNS: Record<
  string,
  (dir: Prisma.SortOrder) => Prisma.BannerOrderByWithRelationInput
> = {
  title: (dir) => ({ title: dir }),
  button: (dir) => ({ buttonText: dir }),
  createdAt: (dir) => ({ createdAt: dir }),
};

@Injectable()
export class BannersService {
  constructor(private readonly prisma: PrismaService) {}

  create(createBannerDto: CreateBannerDto) {
    return this.prisma.banner.create({
      data: createBannerDto,
    });
  }

  async findAll({ limit, offset, sortBy, order }: PaginationDto) {
    const orderBy = buildOrderBy(sortBy, order, BANNER_SORT_COLUMNS, {
      createdAt: 'desc',
    });

    const [data, total] = await this.prisma.$transaction([
      this.prisma.banner.findMany({
        orderBy,
        take: limit,
        skip: offset,
      }),
      this.prisma.banner.count(),
    ]);
    return { data, total, limit, offset };
  }

  async findOne(id: string) {
    const banner = await this.prisma.banner.findUnique({
      where: { id },
    });

    if (!banner) {
      throw new NotFoundException(`Banner with id ${id} not found`);
    }

    return banner;
  }

  async update(id: string, updateBannerDto: UpdateBannerDto) {
    await this.findOne(id);

    return this.prisma.banner.update({
      where: { id },
      data: updateBannerDto,
    });
  }

  async remove(id: string) {
    await this.findOne(id);

    return this.prisma.banner.delete({
      where: { id },
    });
  }

  // Importación masiva desde CSV. Los banners no tienen clave única natural:
  // se resuelve duplicado por `id` (si viene en el archivo) o por `title`.
  async bulkImport({ mode, rows }: BulkImportDto): Promise<BulkResult> {
    type BannerRow = { dto: CreateBannerDto; id?: string };

    return runBulkImport<BannerRow>(rows, mode, {
      prepare: async (raw) => {
        const dto = await validateAgainstDto(CreateBannerDto, {
          image: raw.image,
          title: raw.title,
          description: raw.description,
          buttonText: raw.buttonText,
          buttonLink: raw.buttonLink,
        });
        const id =
          typeof raw.id === 'string' && raw.id.trim() ? raw.id.trim() : undefined;
        return { dto, id };
      },
      findExisting: ({ dto, id }) =>
        id
          ? this.prisma.banner.findUnique({ where: { id } })
          : this.prisma.banner.findFirst({ where: { title: dto.title } }),
      create: ({ dto }) => this.create(dto),
      update: (existing, { dto }) =>
        this.update((existing as { id: string }).id, dto),
    });
  }
}
