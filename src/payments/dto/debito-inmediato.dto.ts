import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsUUID, Matches } from 'class-validator';

export class DebitoOrderDto {
  @ApiProperty({ description: 'UUID de la orden creada en el checkout' })
  @IsUUID()
  orderId: string;
}

export class DebitoConfirmarDto extends DebitoOrderDto {
  @ApiProperty({
    description: 'OTP que el banco envió al teléfono del pagador',
    example: '19807849',
  })
  @IsString()
  @Matches(/^\d{4,9}$/, { message: 'El OTP debe ser numérico (4 a 9 dígitos)' })
  otp: string;
}
