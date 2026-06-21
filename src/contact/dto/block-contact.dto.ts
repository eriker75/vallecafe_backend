import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, MaxLength } from 'class-validator';

export class BlockContactDto {
  @ApiPropertyOptional({ example: 'Spam reiterado desde este email' })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  reason?: string;
}
