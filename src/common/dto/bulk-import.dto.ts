import { ApiProperty } from '@nestjs/swagger';
import { IsArray, IsIn, IsObject } from 'class-validator';
import { IMPORT_MODES, type ImportMode } from '../bulk/bulk-import.helper';

/**
 * Cuerpo de los endpoints de importación masiva `POST /<recurso>/bulk`.
 * Las filas llegan ya tipadas desde el cliente (el parser CSV del dashboard
 * convierte números/booleanos/listas); cada recurso revalida con su CreateDto.
 */
export class BulkImportDto {
  @ApiProperty({
    enum: IMPORT_MODES,
    example: 'upsert',
    description:
      'create = sólo nuevas · update = sólo existentes · upsert = crear o actualizar',
  })
  @IsIn(IMPORT_MODES)
  mode: ImportMode;

  @ApiProperty({
    type: 'array',
    items: { type: 'object', additionalProperties: true },
    description: 'Filas del CSV ya parseadas (una por registro).',
  })
  @IsArray()
  @IsObject({ each: true })
  rows: Record<string, unknown>[];
}
