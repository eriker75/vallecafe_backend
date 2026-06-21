import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, IsString, Min } from 'class-validator';

export class PaginationDto {
  @ApiPropertyOptional({ example: 20, description: 'Número de registros a retornar', default: 20 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  limit: number = 20;

  @ApiPropertyOptional({ example: 0, description: 'Número de registros a saltar', default: 0 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  offset: number = 0;

  // Ordenamiento genérico para los listados (cabeceras clickeables del admin).
  // `sortBy` es la clave pública de la columna; cada servicio la valida contra su
  // propio mapa de columnas permitidas (ver common/sort/build-order-by.ts), así
  // que un valor no soportado cae al orden por defecto en vez de fallar.
  @ApiPropertyOptional({ description: 'Columna por la cual ordenar', example: 'createdAt' })
  @IsOptional()
  @IsString()
  sortBy?: string;

  @ApiPropertyOptional({ enum: ['asc', 'desc'], description: 'Dirección del orden' })
  @IsOptional()
  @IsIn(['asc', 'desc'])
  order?: 'asc' | 'desc';
}
