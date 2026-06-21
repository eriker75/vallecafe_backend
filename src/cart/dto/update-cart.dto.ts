import { PartialType } from '@nestjs/mapped-types';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsArray,
  IsNumber,
  IsOptional,
  IsPositive,
  IsString,
  ValidateNested,
} from 'class-validator';

import { CreateCartDto } from './create-cart.dto';

export class UpdateCartDto extends PartialType(CreateCartDto) {}

export class AddCartItemDto {
  @ApiProperty({ example: 'cldproduct123' })
  @IsString()
  productId: string;

  @ApiPropertyOptional({ example: 1 })
  @IsOptional()
  @IsNumber()
  @IsPositive()
  quantity?: number;
}

export class UpdateCartItemDto {
  @ApiProperty({ example: 3 })
  @IsNumber()
  @IsPositive()
  quantity: number;
}

class CartItemDto {
  @ApiProperty({ example: 'cldproduct123' })
  @IsString()
  productId: string;

  @ApiProperty({ example: 2 })
  @IsNumber()
  @IsPositive()
  quantity: number;
}

export class ReplaceCartItemsDto {
  @ApiProperty({
    type: [CartItemDto],
    example: [{ productId: 'cldproduct123', quantity: 2 }],
  })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CartItemDto)
  items: CartItemDto[];
}

export class ApplyCartCouponDto {
  @ApiProperty({ example: 'DESCUENTO10' })
  @IsString()
  couponCode: string;
}

