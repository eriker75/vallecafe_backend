import { ApiProperty } from '@nestjs/swagger';
import { IsEnum, IsInt, Min } from 'class-validator';

export enum StockOperation {
  ADD = 'add',
  SUBTRACT = 'subtract',
}

export class AdjustStockDto {
  @ApiProperty({ enum: StockOperation, example: 'add', description: 'Sumar o restar del stock actual' })
  @IsEnum(StockOperation)
  operation: StockOperation;

  @ApiProperty({ example: 5, description: 'Cantidad de unidades (bolsas) a sumar o restar (entero positivo)' })
  @IsInt()
  @Min(1)
  quantity: number;
}
