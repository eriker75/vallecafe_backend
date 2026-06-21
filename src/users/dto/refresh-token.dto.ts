import { ApiProperty } from '@nestjs/swagger';
import { IsString } from 'class-validator';

export class RefreshTokenDto {
  @ApiProperty({ example: 'a1b2c3d4...', description: 'Refresh token emitido en el login' })
  @IsString()
  refreshToken: string;
}
