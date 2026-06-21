import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsEmail,
  IsNumber,
  IsOptional,
  IsString,
  MinLength,
  MaxLength,
  IsIn,
} from 'class-validator';
import { ACCOUNT_TYPES } from '../../common/account.constants';

export class CreateUserDto {
  @ApiProperty({ example: 'usuario@ejemplo.com' })
  @IsEmail()
  email: string;

  @ApiProperty({ example: 'Juan' })
  @IsString()
  @MaxLength(100)
  firstName: string;

  @ApiProperty({ example: 'Pérez' })
  @IsString()
  @MaxLength(100)
  lastName: string;

  @ApiPropertyOptional({ example: 'https://cdn.ejemplo.com/avatar.jpg' })
  @IsOptional()
  @IsString()
  avatar?: string;

  @ApiPropertyOptional({ example: '1990-03-15', description: 'Fecha de nacimiento (YYYY-MM-DD)' })
  @IsOptional()
  @IsString()
  @MaxLength(20)
  birthDate?: string;

  @ApiProperty({ example: 'contraseña123' })
  @IsString()
  @MinLength(6)
  password: string;

  @ApiProperty({ example: '+58 412-0000000' })
  @IsString()
  @MaxLength(30)
  phone: string;

  @ApiProperty({ example: 'Av. Principal 123' })
  @IsString()
  @MaxLength(255)
  address: string;

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

  @ApiPropertyOptional({ example: 10.4806, description: 'Latitud (ubicación del cliente, desde el mapa)' })
  @IsOptional()
  @IsNumber()
  latitude?: number;

  @ApiPropertyOptional({ example: -66.9036, description: 'Longitud (ubicación del cliente, desde el mapa)' })
  @IsOptional()
  @IsNumber()
  longitude?: number;

  @ApiPropertyOptional({ example: 'customer', enum: ['customer', 'admin'] })
  @IsOptional()
  @IsString()
  @IsIn(['customer', 'admin'])
  role?: string;

  @ApiPropertyOptional({ example: 'active', enum: ['active', 'inactive'] })
  @IsOptional()
  @IsString()
  @IsIn(['active', 'inactive'])
  status?: string;

  @ApiPropertyOptional({
    example: 'B2C',
    enum: ACCOUNT_TYPES,
    description: 'Segmento comercial: B2C (minorista) o B2B (mayorista). Solo un admin puede asignarlo.',
  })
  @IsOptional()
  @IsString()
  @IsIn(ACCOUNT_TYPES as unknown as string[])
  accountType?: string;

}
