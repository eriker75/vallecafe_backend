import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsDateString,
  IsEnum,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';
import { NotificationAudience, NotificationStatus } from '@prisma/client';

export class CreateNotificationDto {
  @ApiProperty({ example: 'Oferta de verano' })
  @IsString()
  @MaxLength(150)
  title: string;

  @ApiProperty({ example: 'Aprovecha un 20% de descuento este fin de semana.' })
  @IsString()
  @MaxLength(1000)
  message: string;

  @ApiPropertyOptional({
    enum: NotificationAudience,
    default: NotificationAudience.ALL_USERS,
  })
  @IsOptional()
  @IsEnum(NotificationAudience)
  audience?: NotificationAudience;

  @ApiPropertyOptional({
    enum: NotificationStatus,
    default: NotificationStatus.DRAFT,
  })
  @IsOptional()
  @IsEnum(NotificationStatus)
  status?: NotificationStatus;

  @ApiPropertyOptional({ example: '2026-06-01T10:00:00.000Z' })
  @IsOptional()
  @IsDateString()
  scheduledAt?: string;
}
