import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsArray,
  IsEnum,
  IsInt,
  IsNumber,
  IsOptional,
  IsPositive,
  IsString,
  Min,
  ValidateNested,
} from 'class-validator';
import { OrderStatus } from '../order-status.enum';

export class CreateOrderItemDto {
  @ApiProperty({ example: 'cldproduct123' })
  @IsString()
  productId: string;

  @ApiProperty({ example: 2, description: 'Cantidad de unidades (bolsas)' })
  @IsInt()
  @Min(1)
  quantity: number;

  @ApiProperty({ example: 45.99 })
  @IsNumber()
  @IsPositive()
  price: number;
}

export class CreateOrderDto {
  @ApiProperty({ example: 'clduser123' })
  @IsString()
  userId: string;

  @ApiPropertyOptional({ example: 'cldcoupon123' })
  @IsOptional()
  @IsString()
  couponId?: string;

  @ApiPropertyOptional({ example: 10.0 })
  @IsOptional()
  @IsNumber()
  @Min(0)
  discount?: number;

  @ApiProperty({ example: 81.98 })
  @IsNumber()
  @IsPositive()
  total: number;

  @ApiPropertyOptional({ enum: OrderStatus, example: OrderStatus.PENDING })
  @IsOptional()
  @IsEnum(OrderStatus)
  status?: OrderStatus;

  @ApiProperty({ type: [CreateOrderItemDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CreateOrderItemDto)
  items: CreateOrderItemDto[];
}
