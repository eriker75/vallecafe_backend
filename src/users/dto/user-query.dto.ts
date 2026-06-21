import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsOptional, IsString, MaxLength } from 'class-validator';
import { PaginationDto } from '../../common/dto/pagination.dto';
import { ACCOUNT_TYPES } from '../../common/account.constants';

export class UserQueryDto extends PaginationDto {
  @ApiPropertyOptional({ description: 'Buscar por nombre o email', example: 'maria' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  search?: string;

  @ApiPropertyOptional({ enum: ['customer', 'admin'], description: 'Filtrar por rol' })
  @IsOptional()
  @IsString()
  @IsIn(['customer', 'admin'])
  role?: string;

  @ApiPropertyOptional({ enum: ['active', 'inactive'], description: 'Filtrar por estado' })
  @IsOptional()
  @IsString()
  @IsIn(['active', 'inactive'])
  status?: string;

  @ApiPropertyOptional({ enum: ACCOUNT_TYPES, description: 'Filtrar por segmento comercial (B2C/B2B)' })
  @IsOptional()
  @IsString()
  @IsIn(ACCOUNT_TYPES as unknown as string[])
  accountType?: string;
}
