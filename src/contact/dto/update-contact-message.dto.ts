import { ApiProperty } from '@nestjs/swagger';
import { IsEnum } from 'class-validator';
import { ContactMessageStatus } from '@prisma/client';

export class UpdateContactMessageDto {
  @ApiProperty({ enum: ContactMessageStatus, example: 'READ' })
  @IsEnum(ContactMessageStatus)
  status: ContactMessageStatus;
}
