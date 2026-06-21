import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString } from 'class-validator';

export class CreateWishlistDto {
  @ApiProperty({ example: 'clduser123' })
  @IsString()
  userId: string;

  @ApiPropertyOptional({ example: 'cldproduct123' })
  @IsOptional()
  @IsString()
  productId?: string;
}
