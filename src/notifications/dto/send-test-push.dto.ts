import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, MaxLength } from 'class-validator';

// Envío de prueba a los propios dispositivos del usuario autenticado. Útil para
// validar la integración end-to-end (equivale al POST /send-notification del
// proyecto de referencia expo-push-server).
export class SendTestPushDto {
  @ApiPropertyOptional({ example: 'Prueba de notificación' })
  @IsOptional()
  @IsString()
  @MaxLength(150)
  title?: string;

  @ApiPropertyOptional({ example: 'Si ves esto, las push funcionan 🎉' })
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  body?: string;
}
