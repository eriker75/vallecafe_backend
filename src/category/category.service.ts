import { Injectable, NotFoundException } from '@nestjs/common';
import { CreateCategoryDto } from './dto/create-category.dto';
import { UpdateCategoryDto } from './dto/update-category.dto';
import { PrismaService } from '../database/database.service';
import { PaginationDto } from '../common/dto/pagination.dto';
import { BulkImportDto } from '../common/dto/bulk-import.dto';
import {
  runBulkImport,
  validateAgainstDto,
  type BulkResult,
} from '../common/bulk/bulk-import.helper';

@Injectable()
export class CategoryService {
  constructor(private readonly prisma: PrismaService) {}

  create(createCategoryDto: CreateCategoryDto) {
    return this.prisma.category.create({
      data: createCategoryDto,
      include: {
        parent: true,
        children: true,
      },
    });
  }

  async findAll({ limit, offset }: PaginationDto) {
    const [data, total] = await this.prisma.$transaction([
      this.prisma.category.findMany({
        include: { parent: true, children: true },
        orderBy: { name: 'asc' },
        take: limit,
        skip: offset,
      }),
      this.prisma.category.count(),
    ]);
    return { data, total, limit, offset };
  }

  async findOne(id: string) {
    const category = await this.prisma.category.findUnique({
      where: { id },
      include: {
        parent: true,
        children: true,
      },
    });

    if (!category) {
      throw new NotFoundException(`Category with id ${id} not found`);
    }

    return category;
  }

  async update(id: string, updateCategoryDto: UpdateCategoryDto) {
    await this.findOne(id);

    return this.prisma.category.update({
      where: { id },
      data: updateCategoryDto,
      include: {
        parent: true,
        children: true,
      },
    });
  }

  async remove(id: string) {
    await this.findOne(id);

    return this.prisma.category.delete({
      where: { id },
    });
  }

  // Importación masiva desde CSV. Clave única para duplicados: `slug` (@unique).
  async bulkImport({ mode, rows }: BulkImportDto): Promise<BulkResult> {
    return runBulkImport<CreateCategoryDto>(rows, mode, {
      prepare: (raw) =>
        validateAgainstDto(CreateCategoryDto, {
          name: raw.name,
          slug: raw.slug,
          ...(raw.image != null && raw.image !== '' ? { image: raw.image } : {}),
          ...(raw.parentId != null && raw.parentId !== ''
            ? { parentId: raw.parentId }
            : {}),
        }),
      findExisting: (row) =>
        this.prisma.category.findUnique({ where: { slug: row.slug } }),
      create: (row) => this.create(row),
      update: (existing, row) =>
        this.update((existing as { id: string }).id, row),
    });
  }
}
