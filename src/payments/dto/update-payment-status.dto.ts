import { ApiProperty } from '@nestjs/swagger';
import { IsIn, IsString } from 'class-validator';

export class UpdatePaymentStatusDto {
  @ApiProperty({
    example: 'COMPLETED',
    enum: ['PENDING', 'PROCESSING', 'COMPLETED', 'FAILED', 'REFUNDED'],
    description: 'Nuevo estado del pago',
  })
  @IsString()
  @IsIn(['PENDING', 'PROCESSING', 'COMPLETED', 'FAILED', 'REFUNDED'])
  status: string;
}
