import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsBoolean,
  IsNumber,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';

export class CreateAddressDto {
  @ApiProperty({ example: 'clduser123' })
  @IsString()
  userId: string;

  @ApiPropertyOptional({ example: 'Casa' })
  @IsOptional()
  @IsString()
  @MaxLength(50)
  label?: string;

  @ApiProperty({ example: 'Juan Pérez' })
  @IsString()
  @MaxLength(150)
  recipientName: string;

  @ApiProperty({ example: '+58 412-0000000' })
  @IsString()
  @MaxLength(30)
  phone: string;

  @ApiProperty({ example: 'Av. Principal 123' })
  @IsString()
  @MaxLength(255)
  line1: string;

  @ApiPropertyOptional({ example: 'Apto 4B' })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  line2?: string;

  @ApiProperty({ example: 'Caracas' })
  @IsString()
  @MaxLength(100)
  city: string;

  @ApiProperty({ example: 'Distrito Capital' })
  @IsString()
  @MaxLength(100)
  state: string;

  @ApiProperty({ example: '1010' })
  @IsString()
  @MaxLength(20)
  zip: string;

  @ApiPropertyOptional({ example: 'Venezuela' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  country?: string;

  // Coordenadas del picker de mapa (web y app las usan para centrar el mapa
  // al editar y para el envío). Opcionales: una dirección escrita a mano no
  // tiene por qué traerlas.
  @ApiPropertyOptional({ example: 10.488 })
  @IsOptional()
  @IsNumber()
  latitude?: number;

  @ApiPropertyOptional({ example: -66.8587 })
  @IsOptional()
  @IsNumber()
  longitude?: number;

  @ApiPropertyOptional({ example: false })
  @IsOptional()
  @IsBoolean()
  isDefault?: boolean;
}
