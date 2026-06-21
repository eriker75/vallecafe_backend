import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsEnum,
  IsNumber,
  IsOptional,
  IsString,
  Min,
} from 'class-validator';
import { PaginationDto } from '../../common/dto/pagination.dto';

/**
 * Criterios de ordenamiento soportados por el catálogo.
 * Se exponen como string en el query (?sort=price_asc) y se traducen a un
 * `orderBy` de Prisma en el service.
 */
export enum ProductSort {
  FEATURED = 'featured',
  NEWEST = 'newest',
  OLDEST = 'oldest',
  PRICE_ASC = 'price_asc',
  PRICE_DESC = 'price_desc',
  NAME_ASC = 'name_asc',
  NAME_DESC = 'name_desc',
}

/**
 * Filtros del catálogo público de productos. Extiende la paginación
 * (limit/offset) y añade búsqueda de texto, filtro por categoría, rango de
 * precio/puntos, atributos (tueste/origen), etiqueta y disponibilidad.
 *
 * Como el ValidationPipe global usa `whitelist` + `forbidNonWhitelisted`,
 * cualquier parámetro que el frontend envíe debe estar declarado aquí.
 */
export class FilterProductsDto extends PaginationDto {
  @ApiPropertyOptional({ description: 'Búsqueda por nombre o descripción' })
  @IsOptional()
  @IsString()
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  q?: string;

  @ApiPropertyOptional({ description: 'ID (uuid) de la categoría' })
  @IsOptional()
  @IsString()
  categoryId?: string;

  @ApiPropertyOptional({ description: 'Precio mínimo (USD)' })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  minPrice?: number;

  @ApiPropertyOptional({ description: 'Precio máximo (USD)' })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  maxPrice?: number;

  @ApiPropertyOptional({ description: 'Puntos mínimos para canjear' })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  minPoints?: number;

  @ApiPropertyOptional({ description: 'Puntos máximos para canjear' })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  maxPoints?: number;

  @ApiPropertyOptional({ description: 'Nivel de tueste (atributo)', example: 'dark' })
  @IsOptional()
  @IsString()
  roast?: string;

  @ApiPropertyOptional({ description: 'Origen (atributo)', example: 'colombia' })
  @IsOptional()
  @IsString()
  origin?: string;

  @ApiPropertyOptional({
    description: 'Tamaños de bolsa en kg a incluir (coincidencia exacta múltiple). Ej: ?weights=0.25,1',
    example: '0.25,1',
    type: String,
  })
  @IsOptional()
  @Transform(({ value }) => {
    if (Array.isArray(value)) return value.map(Number).filter((n) => Number.isFinite(n));
    if (typeof value === 'string')
      return value.split(',').map((s) => Number(s.trim())).filter((n) => Number.isFinite(n));
    return undefined;
  })
  @IsArray()
  @IsNumber({}, { each: true })
  weights?: number[];

  @ApiPropertyOptional({ description: 'Slug de la etiqueta', example: 'destacados' })
  @IsOptional()
  @IsString()
  tag?: string;

  @ApiPropertyOptional({ description: 'Solo productos con stock disponible' })
  @IsOptional()
  @Transform(({ value }) => value === true || value === 'true' || value === '1')
  @IsBoolean()
  inStock?: boolean;

  @ApiPropertyOptional({ enum: ProductSort, description: 'Orden del listado' })
  @IsOptional()
  @IsEnum(ProductSort)
  sort?: ProductSort;
}
