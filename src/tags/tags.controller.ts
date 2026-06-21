import { Controller, Get, Post, Body, Patch, Param, Delete, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags, ApiOperation, ApiResponse, ApiParam } from '@nestjs/swagger';
import { TagsService } from './tags.service';
import { CreateTagDto } from './dto/create-tag.dto';
import { UpdateTagDto } from './dto/update-tag.dto';
import { Auth } from '../users/decorators/auth.decorators';
import { ValidRoles } from '../users/interfaces';
import { PaginationDto } from '../common/dto/pagination.dto';
import { BulkImportDto } from '../common/dto/bulk-import.dto';

@ApiTags('tags')
@Controller('tags')
export class TagsController {
  constructor(private readonly tagsService: TagsService) {}

  // Admin: crear etiqueta
  @Post()
  @Auth(ValidRoles.admin)
  @ApiBearerAuth()
  @ApiOperation({ summary: '[Admin] Crear una nueva etiqueta' })
  @ApiResponse({ status: 201, description: 'Etiqueta creada correctamente.' })
  @ApiResponse({ status: 401, description: 'No autenticado.' })
  @ApiResponse({ status: 403, description: 'Sin permisos suficientes.' })
  create(@Body() createTagDto: CreateTagDto) {
    return this.tagsService.create(createTagDto);
  }

  // Admin: importación masiva desde CSV (crear / actualizar / upsert)
  @Post('bulk')
  @Auth(ValidRoles.admin)
  @ApiBearerAuth()
  @ApiOperation({ summary: '[Admin] Importar etiquetas en lote (CSV)' })
  @ApiResponse({ status: 201, description: 'Reporte de importación.' })
  bulkImport(@Body() bulkImportDto: BulkImportDto) {
    return this.tagsService.bulkImport(bulkImportDto);
  }

  // Público: listar etiquetas
  @Get()
  @ApiOperation({ summary: 'Obtener todas las etiquetas' })
  @ApiResponse({ status: 200, description: 'Lista de etiquetas.' })
  findAll(@Query() paginationDto: PaginationDto) {
    return this.tagsService.findAll(paginationDto);
  }

  // Público: ver etiqueta
  @Get(':id')
  @ApiOperation({ summary: 'Obtener una etiqueta por ID' })
  @ApiParam({ name: 'id', description: 'ID de la etiqueta (cuid)' })
  @ApiResponse({ status: 200, description: 'Etiqueta encontrada.' })
  @ApiResponse({ status: 404, description: 'Etiqueta no encontrada.' })
  findOne(@Param('id') id: string) {
    return this.tagsService.findOne(id);
  }

  // Admin: editar etiqueta
  @Patch(':id')
  @Auth(ValidRoles.admin)
  @ApiBearerAuth()
  @ApiOperation({ summary: '[Admin] Actualizar una etiqueta' })
  @ApiParam({ name: 'id', description: 'ID de la etiqueta (cuid)' })
  @ApiResponse({ status: 200, description: 'Etiqueta actualizada.' })
  @ApiResponse({ status: 403, description: 'Sin permisos suficientes.' })
  @ApiResponse({ status: 404, description: 'Etiqueta no encontrada.' })
  update(@Param('id') id: string, @Body() updateTagDto: UpdateTagDto) {
    return this.tagsService.update(id, updateTagDto);
  }

  // Admin: eliminar etiqueta
  @Delete(':id')
  @Auth(ValidRoles.admin)
  @ApiBearerAuth()
  @ApiOperation({ summary: '[Admin] Eliminar una etiqueta' })
  @ApiParam({ name: 'id', description: 'ID de la etiqueta (cuid)' })
  @ApiResponse({ status: 200, description: 'Etiqueta eliminada.' })
  @ApiResponse({ status: 403, description: 'Sin permisos suficientes.' })
  @ApiResponse({ status: 404, description: 'Etiqueta no encontrada.' })
  remove(@Param('id') id: string) {
    return this.tagsService.remove(id);
  }
}
