import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsNumber, IsOptional, IsPositive, IsString, Min } from 'class-validator';

export class CreateCartDto {
  @ApiProperty({ example: 'clduser123' })
  @IsString()
  userId: string;

  @ApiPropertyOptional({ example: 'cldproduct123' })
  @IsOptional()
  @IsString()
  productId?: string;

  @ApiPropertyOptional({ example: 1 })
  @IsOptional()
  @IsNumber()
  @IsPositive()
  quantity?: number;

  @ApiPropertyOptional({ example: 'cldcoupon123' })
  @IsOptional()
  @IsString()
  couponId?: string;
}
