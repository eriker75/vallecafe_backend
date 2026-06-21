import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, IsString, MinLength } from 'class-validator';

export class ForgotPasswordDto {
  @ApiProperty({ example: 'cliente@correo.com' })
  @IsEmail({}, { message: 'Correo electrónico inválido' })
  email: string;
}

export class ResetPasswordDto {
  @ApiProperty({ description: 'Token recibido en el enlace del correo' })
  @IsString()
  token: string;

  @ApiProperty({ example: 'NuevaClave123', minLength: 6 })
  @IsString()
  @MinLength(6, { message: 'La contraseña debe tener al menos 6 caracteres' })
  password: string;
}

export class VerifyEmailDto {
  @ApiProperty({ description: 'Token recibido en el enlace del correo' })
  @IsString()
  token: string;
}

export class ResendVerificationDto {
  @ApiProperty({ example: 'cliente@correo.com' })
  @IsEmail({}, { message: 'Correo electrónico inválido' })
  email: string;
}
