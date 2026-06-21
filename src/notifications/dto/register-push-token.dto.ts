import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsBoolean,
  IsIn,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';

// Registro/alta del token push de un dispositivo. El móvil lo llama tras conceder
// permisos de notificaciones (ver PushNotificationProvider en la app). Es idempotente:
// el backend hace upsert por `token` (un mismo dispositivo => una sola fila), y si el
// token ya pertenecía a otra cuenta, lo reasigna al usuario autenticado.
export class RegisterPushTokenDto {
  @ApiProperty({ example: 'ExponentPushToken[xxxxxxxxxxxxxxxxxxxxxx]' })
  @IsString()
  @MaxLength(255)
  token: string;

  @ApiPropertyOptional({ enum: ['ios', 'android', 'web'], example: 'ios' })
  @IsOptional()
  @IsIn(['ios', 'android', 'web'])
  platform?: string;

  @ApiPropertyOptional({ example: 'iPhone 14 Pro' })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  deviceName?: string;

  // Permite registrar el token ya silenciado (switch de ajustes en off).
  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @IsBoolean()
  enabled?: boolean;
}

// Baja de un token (p.ej. al cerrar sesión en el dispositivo).
export class UnregisterPushTokenDto {
  @ApiProperty({ example: 'ExponentPushToken[xxxxxxxxxxxxxxxxxxxxxx]' })
  @IsString()
  @MaxLength(255)
  token: string;
}

// Silencia/activa un dispositivo sin borrar el token (switch de ajustes).
export class SetPushTokenEnabledDto {
  @ApiProperty({ example: 'ExponentPushToken[xxxxxxxxxxxxxxxxxxxxxx]' })
  @IsString()
  @MaxLength(255)
  token: string;

  @ApiProperty({ example: false })
  @IsBoolean()
  enabled: boolean;
}
