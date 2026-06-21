import { ApiProperty } from '@nestjs/swagger';
import { IsString, Matches, MaxLength } from 'class-validator';

export class CreateTagDto {
  @ApiProperty({ example: 'Orgánico' })
  @IsString()
  @MaxLength(100)
  name: string;

  @ApiProperty({ example: 'organico' })
  @IsString()
  @MaxLength(120)
  @Matches(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, {
    message: 'slug must be lowercase letters, numbers and hyphens only',
  })
  slug: string;
}
