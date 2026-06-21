import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, MaxLength } from 'class-validator';
import { PaginationDto } from '../../common/dto/pagination.dto';

export class QueryContactDto extends PaginationDto {
  @ApiPropertyOptional({
    description: 'Buscar por nombre, apellido o email',
    example: 'maria',
  })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  search?: string;
}
