import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsEmail,
  IsIn,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Min,
  ValidateNested,
} from 'class-validator';

export class CreatePublicOrderItemDto {
  @ApiProperty({ example: 'cldproduct123', description: 'UUID del producto' })
  @IsString()
  productId: string;

  @ApiProperty({ example: 2, description: 'Cantidad de unidades (bolsas)' })
  @IsInt()
  @Min(1)
  quantity: number;
}

export class CreatePublicOrderDto {
  @ApiProperty({ example: 'cliente@example.com' })
  @IsEmail()
  email: string;

  @ApiProperty({ example: 'Juan' })
  @IsString()
  firstName: string;

  @ApiProperty({ example: 'Pérez' })
  @IsString()
  lastName: string;

  @ApiProperty({ example: '+58 412 1234567' })
  @IsString()
  phone: string;

  @ApiProperty({ example: 'Av. Principal, Edificio X, Apto 1' })
  @IsString()
  address: string;

  @ApiPropertyOptional({ example: 'Caracas' })
  @IsOptional()
  @IsString()
  city?: string;

  @ApiPropertyOptional({ example: 'Distrito Capital' })
  @IsOptional()
  @IsString()
  state?: string;

  @ApiPropertyOptional({ example: '1010' })
  @IsOptional()
  @IsString()
  zip?: string;

  @ApiPropertyOptional({ example: 'Venezuela' })
  @IsOptional()
  @IsString()
  country?: string;

  @ApiPropertyOptional({ example: 'cldcoupon123' })
  @IsOptional()
  @IsString()
  couponId?: string;

  @ApiPropertyOptional({ example: 'Entregar en horario de oficina' })
  @IsOptional()
  @IsString()
  notes?: string;

  @ApiPropertyOptional({ example: 'Casa', description: 'Etiqueta de la dirección de envío' })
  @IsOptional()
  @IsString()
  addressLabel?: string;

  @ApiPropertyOptional({ example: 10.4806, description: 'Latitud de la dirección de envío' })
  @IsOptional()
  @IsNumber()
  latitude?: number;

  @ApiPropertyOptional({ example: -66.9036, description: 'Longitud de la dirección de envío' })
  @IsOptional()
  @IsNumber()
  longitude?: number;

  @ApiProperty({
    example: 'pago_movil',
    enum: ['pago_movil', 'debito_inmediato', 'efectivo', 'puntos', 'yummy'],
    description:
      'Método de pago. debito_inmediato = cobro interbancario R4 con OTP (requiere bankCode, payerIdDocument y payerPhone)',
  })
  @IsString()
  @IsIn(['pago_movil', 'debito_inmediato', 'efectivo', 'puntos', 'yummy'])
  paymentMethod: string;

  @ApiPropertyOptional({ example: '0123456789', description: 'Referencia del pago (pago móvil)' })
  @IsOptional()
  @IsString()
  paymentReference?: string;

  @ApiPropertyOptional({ example: 'V-12345678', description: 'Cédula del pagador' })
  @IsOptional()
  @IsString()
  payerIdDocument?: string;

  @ApiPropertyOptional({ example: 'Juan Pérez', description: 'Nombre del pagador' })
  @IsOptional()
  @IsString()
  payerName?: string;

  @ApiPropertyOptional({ example: '+58 412 1234567', description: 'Teléfono del pagador' })
  @IsOptional()
  @IsString()
  payerPhone?: string;

  @ApiPropertyOptional({
    example: '0102',
    description: 'Código del banco del cliente (pago móvil). Se normaliza a 4 dígitos.',
  })
  @IsOptional()
  @IsString()
  bankCode?: string;

  @ApiPropertyOptional({
    example: 36.5,
    description: 'Tasa BCV USD→VES. IGNORADO: la tasa se calcula en el servidor.',
  })
  @IsOptional()
  @IsNumber()
  bcvRate?: number;

  @ApiProperty({ type: [CreatePublicOrderItemDto] })
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => CreatePublicOrderItemDto)
  items: CreatePublicOrderItemDto[];
}
