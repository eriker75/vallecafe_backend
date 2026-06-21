import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsOptional } from 'class-validator';
import { ContactMessageStatus } from '@prisma/client';
import { PaginationDto } from '../../common/dto/pagination.dto';

export class QueryContactMessageDto extends PaginationDto {
  @ApiPropertyOptional({ enum: ContactMessageStatus, description: 'Filtrar por estado' })
  @IsOptional()
  @IsEnum(ContactMessageStatus)
  status?: ContactMessageStatus;
}
