import { Body, Controller, Delete, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiParam, ApiQuery, ApiResponse, ApiTags } from '@nestjs/swagger';
import { Auth } from '../users/decorators/auth.decorators';
import { ValidRoles } from '../users/interfaces';
import { BulkUpsertSettingDto } from './dto/bulk-upsert-setting.dto';
import { CreateSettingDto } from './dto/create-setting.dto';
import { UpdateSettingDto } from './dto/update-setting.dto';
import { SettingsService } from './settings.service';

@ApiTags('settings')
@Controller('settings')
export class SettingsController {
  constructor(private readonly settingsService: SettingsService) {}

  // Admin: crear setting individual
  @Post()
  @Auth(ValidRoles.admin)
  @ApiBearerAuth()
  @ApiOperation({ summary: '[Admin] Crear un setting' })
  @ApiResponse({ status: 201, description: 'Setting creado.' })
  @ApiResponse({ status: 409, description: 'La clave ya existe.' })
  create(@Body() dto: CreateSettingDto) {
    return this.settingsService.create(dto);
  }

  // Admin: upsert masivo (crear o actualizar varios a la vez)
  @Post('bulk')
  @Auth(ValidRoles.admin)
  @ApiBearerAuth()
  @ApiOperation({ summary: '[Admin] Crear o actualizar varios settings a la vez (upsert por metaKey)' })
  @ApiResponse({ status: 201, description: 'Settings procesados.' })
  bulkUpsert(@Body() dto: BulkUpsertSettingDto) {
    return this.settingsService.bulkUpsert(dto);
  }

  // Público: listar todos los settings, con filtro opcional por grupo
  @Get()
  @ApiOperation({ summary: 'Listar settings (filtrar por metaGroup con ?group=)' })
  @ApiQuery({ name: 'group', required: false, example: 'SOCIAL_NETWORK' })
  @ApiResponse({ status: 200, description: 'Lista de settings.' })
  findAll(@Query('group') group?: string) {
    return this.settingsService.findAll(group);
  }

  // Público: obtener un setting por su metaKey
  @Get(':metaKey')
  @ApiOperation({ summary: 'Obtener un setting por metaKey' })
  @ApiParam({ name: 'metaKey', example: 'social_facebook' })
  @ApiResponse({ status: 200, description: 'Setting encontrado.' })
  @ApiResponse({ status: 404, description: 'Setting no encontrado.' })
  findByKey(@Param('metaKey') metaKey: string) {
    return this.settingsService.findByKey(metaKey);
  }

  // Admin: actualizar un setting por su metaKey
  @Patch(':metaKey')
  @Auth(ValidRoles.admin)
  @ApiBearerAuth()
  @ApiOperation({ summary: '[Admin] Actualizar un setting por metaKey' })
  @ApiParam({ name: 'metaKey', example: 'social_facebook' })
  @ApiResponse({ status: 200, description: 'Setting actualizado.' })
  @ApiResponse({ status: 404, description: 'Setting no encontrado.' })
  updateByKey(@Param('metaKey') metaKey: string, @Body() dto: UpdateSettingDto) {
    return this.settingsService.updateByKey(metaKey, dto);
  }

  // Admin: eliminar un setting por su metaKey
  @Delete(':metaKey')
  @Auth(ValidRoles.admin)
  @ApiBearerAuth()
  @ApiOperation({ summary: '[Admin] Eliminar un setting por metaKey' })
  @ApiParam({ name: 'metaKey', example: 'social_facebook' })
  @ApiResponse({ status: 200, description: 'Setting eliminado.' })
  @ApiResponse({ status: 404, description: 'Setting no encontrado.' })
  removeByKey(@Param('metaKey') metaKey: string) {
    return this.settingsService.removeByKey(metaKey);
  }
}
