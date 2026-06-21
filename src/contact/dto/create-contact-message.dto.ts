import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsEmail, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';
import { sanitizePlainText } from '../sanitize';

const sanitize = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? sanitizePlainText(value) : value;

export class CreateContactMessageDto {
  @ApiProperty({ example: 'María González' })
  @Transform(sanitize)
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  name: string;

  @ApiProperty({ example: 'maria@example.com' })
  @Transform(({ value }) => (typeof value === 'string' ? value.trim().toLowerCase() : value))
  @IsEmail()
  @MaxLength(160)
  email: string;

  @ApiPropertyOptional({ example: 'Consulta sobre producto' })
  @IsOptional()
  @Transform(sanitize)
  @IsString()
  @MaxLength(160)
  subject?: string;

  @ApiProperty({ example: 'Hola, me gustaría saber si tienen café descafeinado.' })
  @Transform(sanitize)
  @IsString()
  @MinLength(5)
  @MaxLength(2000)
  message: string;
}
