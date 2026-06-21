import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsArray, ValidateNested, ArrayMinSize } from 'class-validator';
import { CreateSettingDto } from './create-setting.dto';

export class BulkUpsertSettingDto {
  @ApiProperty({ type: [CreateSettingDto], description: 'Lista de settings a crear o actualizar' })
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => CreateSettingDto)
  settings: CreateSettingDto[];
}
