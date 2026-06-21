import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsUrl, MaxLength } from 'class-validator';

export class CreateBannerDto {
  @ApiProperty({ example: 'https://cdn.ejemplo.com/banner.jpg' })
  @IsString()
  image: string;

  @ApiProperty({ example: 'Gran Venta de Temporada' })
  @IsString()
  @MaxLength(200)
  title: string;

  @ApiProperty({ example: 'Hasta 40% de descuento en vinos seleccionados' })
  @IsString()
  @MaxLength(500)
  description: string;

  @ApiProperty({ example: 'Comprar ahora' })
  @IsString()
  @MaxLength(100)
  buttonText: string;

  @ApiProperty({ example: '/products?sale=true' })
  @IsString()
  @MaxLength(500)
  buttonLink: string;
}
