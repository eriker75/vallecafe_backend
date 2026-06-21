import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsDateString, IsInt, IsOptional, Min } from 'class-validator';

// Rango de fechas (opcional) y límite para la tabla de rentabilidad por producto.
// Las fechas son ISO (YYYY-MM-DD); `dateTo` se interpreta hasta el fin del día.
export class ProductProfitabilityQueryDto {
  @ApiPropertyOptional({ example: '2026-01-01', description: 'Fecha desde (ISO)' })
  @IsOptional()
  @IsDateString()
  dateFrom?: string;

  @ApiPropertyOptional({ example: '2026-06-30', description: 'Fecha hasta (ISO, inclusive)' })
  @IsOptional()
  @IsDateString()
  dateTo?: string;

  @ApiPropertyOptional({ example: 20, description: 'Máximo de filas (ordenadas por utilidad desc)' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  limit?: number;
}
