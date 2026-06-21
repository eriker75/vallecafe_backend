import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsEmail,
  IsOptional,
  IsString,
  MinLength,
  MaxLength,
} from 'class-validator';

export class RegisterUserDto {
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
}
