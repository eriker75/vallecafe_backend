import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsNumber, IsOptional, IsPositive, IsString } from 'class-validator';

export class UpdateBcvRateDto {
  @ApiProperty({ example: 40.5, description: 'Tasa BCV USD→VES (manual)' })
  @IsNumber()
  @IsPositive()
  rate: number;

  @ApiPropertyOptional({ example: 'Ajuste manual del 01/06', description: 'Nota opcional' })
  @IsOptional()
  @IsString()
  note?: string;
}
