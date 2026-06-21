import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, IsUrl, Matches, MaxLength } from 'class-validator';

export class CreateCategoryDto {
  @ApiProperty({ example: 'Vinos Tintos' })
  @IsString()
  @MaxLength(100)
  name: string;

  @ApiProperty({ example: 'vinos-tintos' })
  @IsString()
  @MaxLength(120)
  @Matches(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, {
    message: 'slug must be lowercase letters, numbers and hyphens only',
  })
  slug: string;

  @ApiPropertyOptional({ example: 'https://cdn.ejemplo.com/categoria.jpg' })
  @IsOptional()
  @IsString()
  image?: string;

  @ApiPropertyOptional({ example: 'uuid-categoria-padre' })
  @IsOptional()
  @IsString()
  parentId?: string;
}
