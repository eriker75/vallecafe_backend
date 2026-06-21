import { PartialType } from '@nestjs/mapped-types';
import { ApiProperty } from '@nestjs/swagger';
import { IsArray, IsString } from 'class-validator';
import { CreateWishlistDto } from './create-wishlist.dto';

export class UpdateWishlistDto extends PartialType(CreateWishlistDto) {}

export class AddWishlistItemDto {
  @ApiProperty({ example: 'cldproduct123' })
  @IsString()
  productId: string;
}

export class UpdateWishlistItemsDto {
  @ApiProperty({ example: ['cldproduct123', 'cldproduct456'] })
  @IsArray()
  @IsString({ each: true })
  productIds: string[];
}
