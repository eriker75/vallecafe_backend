import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../database/database.service';
import { BulkUpsertSettingDto } from './dto/bulk-upsert-setting.dto';
import { CreateSettingDto } from './dto/create-setting.dto';
import { UpdateSettingDto } from './dto/update-setting.dto';

@Injectable()
export class SettingsService {
  constructor(private readonly prisma: PrismaService) {}

  async create(dto: CreateSettingDto) {
    const existing = await this.prisma.setting.findUnique({
      where: { metaKey: dto.metaKey },
    });

    if (existing) {
      throw new ConflictException(`El setting con clave "${dto.metaKey}" ya existe`);
    }

    return this.prisma.setting.create({ data: dto });
  }

  findAll(group?: string) {
    return this.prisma.setting.findMany({
      where: group ? { metaGroup: group } : undefined,
      orderBy: { metaKey: 'asc' },
    });
  }

  async findByKey(metaKey: string) {
    const setting = await this.prisma.setting.findUnique({ where: { metaKey } });

    if (!setting) {
      throw new NotFoundException(`Setting con clave "${metaKey}" no encontrado`);
    }

    return setting;
  }

  async updateByKey(metaKey: string, dto: UpdateSettingDto) {
    await this.findByKey(metaKey);

    return this.prisma.setting.update({
      where: { metaKey },
      data: dto,
    });
  }

  async removeByKey(metaKey: string) {
    await this.findByKey(metaKey);

    return this.prisma.setting.delete({ where: { metaKey } });
  }

  async bulkUpsert(dto: BulkUpsertSettingDto) {
    const operations = dto.settings.map((s) =>
      this.prisma.setting.upsert({
        where: { metaKey: s.metaKey },
        update: {
          metaValue: s.metaValue,
          ...(s.metaGroup !== undefined && { metaGroup: s.metaGroup }),
        },
        create: s,
      }),
    );

    return this.prisma.$transaction(operations);
  }
}
