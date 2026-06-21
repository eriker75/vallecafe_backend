import { Body, Controller, Delete, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiParam, ApiResponse, ApiTags } from '@nestjs/swagger';
import { ContactService } from './contact.service';
import { QueryContactDto } from './dto/query-contact.dto';
import { CreateContactDto } from './dto/create-contact.dto';
import { UpdateContactDto } from './dto/update-contact.dto';
import { BlockContactDto } from './dto/block-contact.dto';
import { Auth } from '../users/decorators/auth.decorators';
import { ValidRoles } from '../users/interfaces';
import { BulkImportDto } from '../common/dto/bulk-import.dto';

// Controlador del directorio de contactos (plural) para el dashboard admin.
// Se mantiene aparte de `@Controller('contact')` (mensajes/blocks) para evitar
// cualquier colisión de rutas.
@ApiTags('contacts')
@Controller('contacts')
export class ContactsController {
  constructor(private readonly contactService: ContactService) {}

  @Get()
  @Auth(ValidRoles.admin)
  @ApiBearerAuth()
  @ApiOperation({
    summary: '[Admin] Directorio de contactos con su usuario y fuente(s)',
  })
  @ApiResponse({ status: 200, description: 'Lista paginada de contactos.' })
  findAll(@Query() query: QueryContactDto) {
    return this.contactService.findAllContacts(query);
  }

  @Post()
  @Auth(ValidRoles.admin)
  @ApiBearerAuth()
  @ApiOperation({ summary: '[Admin] Crear un contacto' })
  @ApiResponse({ status: 201, description: 'Contacto creado.' })
  @ApiResponse({ status: 409, description: 'Ya existe un contacto con ese email.' })
  create(@Body() dto: CreateContactDto) {
    return this.contactService.createContact(dto);
  }

  // Admin: importación masiva del directorio desde CSV (crear / actualizar / upsert)
  @Post('bulk')
  @Auth(ValidRoles.admin)
  @ApiBearerAuth()
  @ApiOperation({ summary: '[Admin] Importar contactos en lote (CSV)' })
  @ApiResponse({ status: 201, description: 'Reporte de importación.' })
  bulkImport(@Body() bulkImportDto: BulkImportDto) {
    return this.contactService.bulkImportContacts(bulkImportDto);
  }

  @Patch(':id')
  @Auth(ValidRoles.admin)
  @ApiBearerAuth()
  @ApiOperation({ summary: '[Admin] Actualizar un contacto' })
  @ApiParam({ name: 'id', description: 'UUID del contacto' })
  @ApiResponse({ status: 200, description: 'Contacto actualizado.' })
  @ApiResponse({ status: 404, description: 'Contacto no encontrado.' })
  update(@Param('id') id: string, @Body() dto: UpdateContactDto) {
    return this.contactService.updateContact(id, dto);
  }

  @Delete(':id')
  @Auth(ValidRoles.admin)
  @ApiBearerAuth()
  @ApiOperation({ summary: '[Admin] Eliminar un contacto' })
  @ApiParam({ name: 'id', description: 'UUID del contacto' })
  @ApiResponse({ status: 200, description: 'Contacto eliminado.' })
  @ApiResponse({ status: 404, description: 'Contacto no encontrado.' })
  remove(@Param('id') id: string) {
    return this.contactService.deleteContact(id);
  }

  @Post(':id/block')
  @Auth(ValidRoles.admin)
  @ApiBearerAuth()
  @ApiOperation({ summary: '[Admin] Bloquear (lista negra) el email de un contacto' })
  @ApiParam({ name: 'id', description: 'UUID del contacto' })
  @ApiResponse({ status: 201, description: 'Email bloqueado.' })
  @ApiResponse({ status: 404, description: 'Contacto no encontrado.' })
  block(@Param('id') id: string, @Body() dto: BlockContactDto) {
    return this.contactService.blockContact(id, dto.reason);
  }
}
