import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsIn,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';

// Login/registro con Apple. El cliente (iOS/web) obtiene el identity_token de
// Apple y lo envía aquí. A diferencia de Google, el token de Apple NO incluye el
// nombre: Apple sólo lo entrega al cliente en el PRIMER inicio de sesión, así que
// el front lo reenvía en firstName/lastName (opcionales). El backend verifica el
// token, hace upsert de User+SocialAccount y devuelve el MISMO shape que login.
export class AppleLoginDto {
  @ApiProperty({ description: 'identity_token JWT emitido por Apple' })
  @IsString()
  @MinLength(10)
  identityToken: string;

  @ApiPropertyOptional({
    description: 'Nombre (sólo 1er login; lo da el cliente)',
  })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  firstName?: string;

  @ApiPropertyOptional({
    description: 'Apellido (sólo 1er login; lo da el cliente)',
  })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  lastName?: string;

  // Segmento comercial al CREAR la cuenta (sólo aplica si el usuario es nuevo).
  @ApiPropertyOptional({ enum: ['B2C', 'B2B'], default: 'B2C' })
  @IsOptional()
  @IsIn(['B2C', 'B2B'])
  accountType?: string;
}
