import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { ProductRelationType } from '@prisma/client';
import { Type } from 'class-transformer';
import {
  IsArray,
  IsEnum,
  IsIn,
  IsNumber,
  IsOptional,
  IsPositive,
  IsString,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import { PRODUCT_VISIBILITIES } from '../../common/account.constants';

export class CreateProductAttributeDto {
  @ApiProperty({ example: 'Color' })
  @IsString()
  @MaxLength(100)
  name: string;

  @ApiProperty({ example: 'Rojo' })
  @IsString()
  @MaxLength(255)
  value: string;
}

export class CreateProductVariantDto {
  @ApiProperty({ example: 'Tamaño' })
  @IsString()
  @MaxLength(100)
  name: string;

  @ApiProperty({ example: '250g' })
  @IsString()
  @MaxLength(255)
  value: string;
}

export class ProductRelationDto {
  @ApiProperty({ example: 'uuid-del-producto-relacionado' })
  @IsString()
  relatedId: string;

  @ApiProperty({ enum: ProductRelationType, example: ProductRelationType.UPSELL })
  @IsEnum(ProductRelationType)
  relationType: ProductRelationType;
}

export class CreateProductDto {
  @ApiProperty({ example: 'Vino Tinto Reserva 2020' })
  @IsString()
  @MaxLength(255)
  name: string;

  @ApiProperty({
    example: 'Vino tinto de uva Malbec con crianza de 12 meses en barrica.',
  })
  @IsString()
  description: string;

  @ApiProperty({ example: 45.99 })
  @IsNumber()
  @IsPositive()
  price: number;

  @ApiPropertyOptional({
    example: 39.99,
    description: 'Precio de oferta. Si < price, el cliente paga este y la card tacha el precio normal. null = sin oferta.',
    nullable: true,
  })
  @IsOptional()
  @IsNumber()
  @Min(0)
  offerPrice?: number | null;

  @ApiPropertyOptional({
    example: 18.5,
    description: 'Costo del producto (lo que paga la tienda). SOLO admin; nunca se expone al cliente. Base del cálculo de utilidades.',
    nullable: true,
  })
  @IsOptional()
  @IsNumber()
  @Min(0)
  cost?: number | null;

  @ApiPropertyOptional({
    example: 1,
    description: 'Peso/tamaño de la bolsa en KG, hasta 3 decimales (0.275 = 275g, 1 = 1kg, 4 = 4kg). Identificador filtrable; se muestra en la card.',
    nullable: true,
  })
  @IsOptional()
  @IsNumber()
  @Min(0)
  weightKg?: number | null;

  @ApiPropertyOptional({
    example: 'ALL',
    enum: PRODUCT_VISIBILITIES,
    description: 'Quién ve/compra el producto: ALL (todos), RETAIL_ONLY (solo B2C), WHOLESALE_ONLY (solo B2B).',
  })
  @IsOptional()
  @IsString()
  @IsIn(PRODUCT_VISIBILITIES as unknown as string[])
  visibility?: string;

  @ApiPropertyOptional({ example: 'https://cdn.ejemplo.com/vino.jpg' })
  @IsOptional()
  @IsString()
  mainImage?: string;

  @ApiPropertyOptional({ example: ['https://cdn.ejemplo.com/img1.jpg'] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  images?: string[];

  @ApiPropertyOptional({ example: 100 })
  @IsOptional()
  @IsNumber()
  @Min(0)
  stock?: number;

  @ApiPropertyOptional({ example: 'cldxxxxxxxxxxxxx' })
  @IsOptional()
  @IsString()
  categoryId?: string;

  @ApiPropertyOptional({ example: ['cldtag1', 'cldtag2'] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  tagIds?: string[];

  @ApiPropertyOptional({ type: [CreateProductAttributeDto] })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CreateProductAttributeDto)
  attributes?: CreateProductAttributeDto[];

  @ApiPropertyOptional({ type: [CreateProductVariantDto] })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CreateProductVariantDto)
  variants?: CreateProductVariantDto[];

  @ApiPropertyOptional({ type: [ProductRelationDto] })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ProductRelationDto)
  relatedProducts?: ProductRelationDto[];

  @ApiPropertyOptional({
    example: 500,
    description: 'Costo en puntos para comprar el producto usando puntos acumulados',
    nullable: true,
  })
  @IsOptional()
  @IsNumber()
  @Min(0)
  pointsPrice?: number | null;

  @ApiPropertyOptional({
    example: 10,
    description: 'Puntos que el usuario acumula al comprar este producto con dinero',
    nullable: true,
  })
  @IsOptional()
  @IsNumber()
  @Min(0)
  pointsEarned?: number | null;
}
