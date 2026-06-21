import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, MaxLength } from 'class-validator';

export class CreateSettingDto {
  @ApiProperty({ example: 'social_facebook', description: 'Clave única del setting' })
  @IsString()
  @MaxLength(150)
  metaKey: string;

  @ApiProperty({ example: 'https://facebook.com/mi-tienda', description: 'Valor del setting' })
  @IsString()
  metaValue: string;

  @ApiPropertyOptional({ example: 'SOCIAL_NETWORK', description: 'Grupo al que pertenece el setting' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  metaGroup?: string;
}
