import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsISO8601, IsNumber, IsOptional, IsString, MaxLength, Min } from 'class-validator';
import { Type } from 'class-transformer';
import { OrderStatus } from '../order-status.enum';
import { PaginationDto } from '../../common/dto/pagination.dto';

export class OrderQueryDto extends PaginationDto {
  @ApiPropertyOptional({ enum: OrderStatus })
  @IsOptional()
  @IsEnum(OrderStatus)
  status?: OrderStatus;

  @ApiPropertyOptional({ description: 'Fecha desde (ISO 8601)', example: '2024-01-01' })
  @IsOptional()
  @IsISO8601()
  dateFrom?: string;

  @ApiPropertyOptional({ description: 'Fecha hasta (ISO 8601)', example: '2024-12-31' })
  @IsOptional()
  @IsISO8601()
  dateTo?: string;

  @ApiPropertyOptional({ description: 'Total mínimo', example: 0 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  minTotal?: number;

  @ApiPropertyOptional({ description: 'Total máximo', example: 1000 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  maxTotal?: number;

  @ApiPropertyOptional({ description: 'Buscar por nombre o email del cliente' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  search?: string;
}
