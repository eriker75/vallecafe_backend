import { IsEnum, IsNumber, IsOptional, Max, Min } from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export enum AnalyticsPeriod {
  DAILY = 'daily',
  MONTHLY = 'monthly',
  QUARTERLY = 'quarterly',
  SEMIANNUAL = 'semiannual',
  ANNUAL = 'annual',
}

export class OrderAnalyticsQueryDto {
  @ApiProperty({ enum: AnalyticsPeriod, example: 'monthly' })
  @IsEnum(AnalyticsPeriod)
  period: AnalyticsPeriod;

  @ApiPropertyOptional({ example: 2026, description: 'Año para período diario/mensual/trimestral/semestral' })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(2000)
  year?: number;

  @ApiPropertyOptional({ example: 6, description: 'Mes (1-12), requerido para el período diario' })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  @Max(12)
  month?: number;

  @ApiPropertyOptional({ example: 2020, description: 'Año inicio para período anual' })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(2000)
  yearFrom?: number;

  @ApiPropertyOptional({ example: 2026, description: 'Año fin para período anual' })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(2000)
  yearTo?: number;
}
