import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsOptional, IsString, MinLength } from 'class-validator';

// Login/registro con Google: el cliente (web/iOS/Android) obtiene el id_token de
// Google y lo envía aquí. El backend lo verifica, hace upsert de User+SocialAccount
// y devuelve el MISMO shape que login/register (usuario plano + accessToken +
// refreshToken). Un solo endpoint sirve para iniciar sesión y para registrarse.
export class GoogleLoginDto {
  @ApiProperty({ description: 'id_token JWT emitido por Google' })
  @IsString()
  @MinLength(10)
  idToken: string;

  // Segmento comercial al CREAR la cuenta (sólo aplica si el usuario es nuevo).
  // Las cuentas existentes conservan el suyo. Por defecto B2C (minorista).
  @ApiPropertyOptional({ enum: ['B2C', 'B2B'], default: 'B2C' })
  @IsOptional()
  @IsIn(['B2C', 'B2B'])
  accountType?: string;
}
