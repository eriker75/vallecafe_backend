import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsEnum, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';
import { ContactBlockType } from '@prisma/client';

export class CreateContactBlockDto {
  @ApiProperty({ enum: ContactBlockType, example: 'EMAIL' })
  @IsEnum(ContactBlockType)
  type: ContactBlockType;

  @ApiProperty({ example: 'spam@bad.com', description: 'Email, IP o palabra clave a bloquear' })
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  value: string;

  @ApiPropertyOptional({ example: 'Envió 50 mensajes en una hora' })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  reason?: string;

  @ApiPropertyOptional({
    example: 'b1a2c3d4-...',
    description: 'UUID del contacto del que proviene este bloqueo (opcional)',
  })
  @IsOptional()
  @IsString()
  contactId?: string;
}
