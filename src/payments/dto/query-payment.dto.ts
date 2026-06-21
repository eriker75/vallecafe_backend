import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsOptional, IsString } from 'class-validator';
import { PaginationDto } from '../../common/dto/pagination.dto';

export class QueryPaymentDto extends PaginationDto {
  @ApiPropertyOptional({
    description: 'Filtrar por estado del pago',
    enum: ['PENDING', 'PROCESSING', 'COMPLETED', 'FAILED', 'REFUNDED'],
  })
  @IsOptional()
  @IsString()
  @IsIn(['PENDING', 'PROCESSING', 'COMPLETED', 'FAILED', 'REFUNDED'])
  status?: string;

  @ApiPropertyOptional({ description: 'Filtrar por método', example: 'pago_movil' })
  @IsOptional()
  @IsString()
  method?: string;

  @ApiPropertyOptional({ description: 'Filtrar por código de banco (pago móvil)', example: '0105' })
  @IsOptional()
  @IsString()
  bank?: string;

  @ApiPropertyOptional({ description: 'Buscar por referencia, cédula, teléfono o email del cliente' })
  @IsOptional()
  @IsString()
  search?: string;

  @ApiPropertyOptional({ description: 'Desde (ISO date)', example: '2026-01-01' })
  @IsOptional()
  @IsString()
  dateFrom?: string;

  @ApiPropertyOptional({ description: 'Hasta (ISO date)', example: '2026-12-31' })
  @IsOptional()
  @IsString()
  dateTo?: string;
}
