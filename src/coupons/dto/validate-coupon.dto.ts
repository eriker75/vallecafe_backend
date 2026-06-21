import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsArray, IsOptional, IsString, MaxLength } from 'class-validator';

// Payload público para validar un cupón por código desde el carrito/checkout.
// `productIds` es opcional: si se envía, se valida que el cupón aplique a esos
// productos (cupones restringidos por producto).
export class ValidateCouponDto {
  @ApiProperty({ example: 'VERANO2025' })
  @IsString()
  @MaxLength(50)
  code: string;

  @ApiPropertyOptional({ example: ['cldproduct123', 'cldproduct456'] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  productIds?: string[];
}
