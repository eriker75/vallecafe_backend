import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsOptional,
  IsString,
  ValidateNested,
} from 'class-validator';

export class UserSettingItemDto {
  @ApiProperty({ example: 'notif_push', description: 'Clave del setting (única por usuario)' })
  @IsString()
  metaKey: string;

  @ApiProperty({ example: 'true', description: 'Valor serializado como string' })
  @IsString()
  metaValue: string;

  @ApiPropertyOptional({ example: 'notifications', description: 'Grupo al que pertenece el setting' })
  @IsOptional()
  @IsString()
  metaGroup?: string;
}

export class UpsertUserSettingsDto {
  @ApiProperty({ type: [UserSettingItemDto] })
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => UserSettingItemDto)
  settings: UserSettingItemDto[];
}
