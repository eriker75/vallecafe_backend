import { Body, Controller, Delete, Get, Headers, Ip, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiParam, ApiQuery, ApiResponse, ApiTags } from '@nestjs/swagger';
import { ContactBlockType } from '@prisma/client';
import { ContactService } from './contact.service';
import { CreateContactMessageDto } from './dto/create-contact-message.dto';
import { UpdateContactMessageDto } from './dto/update-contact-message.dto';
import { QueryContactMessageDto } from './dto/query-contact-message.dto';
import { CreateContactBlockDto } from './dto/create-contact-block.dto';
import { SubscribeNewsletterDto } from './dto/subscribe-newsletter.dto';
import { Auth } from '../users/decorators/auth.decorators';
import { ValidRoles } from '../users/interfaces';

@ApiTags('contact')
@Controller('contact')
export class ContactController {
  constructor(private readonly contactService: ContactService) {}

  // Público: cualquiera puede enviar un mensaje desde el formulario de contacto.
  // Capturamos la IP (X-Forwarded-For si hay proxy, si no la del socket) para
  // el rate limiting y para poder bloquearla desde el dashboard.
  @Post()
  @ApiOperation({ summary: 'Enviar un mensaje de contacto (público)' })
  @ApiResponse({ status: 201, description: 'Mensaje recibido.' })
  @ApiResponse({ status: 400, description: 'Datos inválidos.' })
  @ApiResponse({ status: 403, description: 'Remitente bloqueado.' })
  @ApiResponse({ status: 429, description: 'Demasiados mensajes (rate limit).' })
  create(
    @Body() dto: CreateContactMessageDto,
    @Ip() ip: string,
    @Headers('x-forwarded-for') xff?: string,
  ) {
    const realIp = xff?.split(',')[0]?.trim() || ip || 'unknown';
    return this.contactService.createFromPublic(dto, realIp);
  }

  // Público: suscripción al newsletter. Guarda el email como contacto con la
  // fuente "newsletter" (idempotente por email).
  @Post('newsletter')
  @ApiOperation({ summary: 'Suscribirse al newsletter (público)' })
  @ApiResponse({ status: 201, description: 'Suscripción registrada.' })
  @ApiResponse({ status: 400, description: 'Email inválido.' })
  subscribeNewsletter(@Body() dto: SubscribeNewsletterDto) {
    return this.contactService.subscribeNewsletter(dto.email);
  }

  // ── Admin: rutas estáticas antes de las paramétricas ───────────────────────

  @Get('stats')
  @Auth(ValidRoles.admin)
  @ApiBearerAuth()
  @ApiOperation({ summary: '[Admin] Conteo de mensajes (total y sin leer)' })
  getStats() {
    return this.contactService.getStats();
  }

  @Get()
  @Auth(ValidRoles.admin)
  @ApiBearerAuth()
  @ApiOperation({ summary: '[Admin] Bandeja de mensajes de contacto' })
  @ApiResponse({ status: 200, description: 'Lista paginada de mensajes.' })
  findAll(@Query() query: QueryContactMessageDto) {
    return this.contactService.findAll(query);
  }

  @Delete('trash')
  @Auth(ValidRoles.admin)
  @ApiBearerAuth()
  @ApiOperation({ summary: '[Admin] Vaciar la papelera (borra todos los mensajes en papelera)' })
  @ApiResponse({ status: 200, description: 'Papelera vaciada.' })
  emptyTrash() {
    return this.contactService.emptyTrash();
  }

  // ── Lista negra anti-spam (admin) ──────────────────────────────────────────

  @Get('blocks')
  @Auth(ValidRoles.admin)
  @ApiBearerAuth()
  @ApiOperation({ summary: '[Admin] Listar bloqueos anti-spam (email/IP/keyword)' })
  @ApiQuery({ name: 'type', required: false, enum: ContactBlockType })
  listBlocks(@Query('type') type?: ContactBlockType) {
    return this.contactService.listBlocks(type);
  }

  @Post('blocks')
  @Auth(ValidRoles.admin)
  @ApiBearerAuth()
  @ApiOperation({ summary: '[Admin] Crear un bloqueo (email, IP o palabra clave)' })
  @ApiResponse({ status: 201, description: 'Bloqueo creado.' })
  createBlock(@Body() dto: CreateContactBlockDto) {
    return this.contactService.createBlock(dto);
  }

  @Delete('blocks/:id')
  @Auth(ValidRoles.admin)
  @ApiBearerAuth()
  @ApiOperation({ summary: '[Admin] Eliminar un bloqueo' })
  @ApiParam({ name: 'id', description: 'UUID del bloqueo' })
  removeBlock(@Param('id') id: string) {
    return this.contactService.removeBlock(id);
  }

  @Get(':id')
  @Auth(ValidRoles.admin)
  @ApiBearerAuth()
  @ApiOperation({ summary: '[Admin] Ver un mensaje de contacto' })
  @ApiParam({ name: 'id', description: 'UUID del mensaje' })
  findOne(@Param('id') id: string) {
    return this.contactService.findOne(id);
  }

  @Patch(':id')
  @Auth(ValidRoles.admin)
  @ApiBearerAuth()
  @ApiOperation({ summary: '[Admin] Cambiar el estado de un mensaje (NEW/READ/ARCHIVED)' })
  @ApiParam({ name: 'id', description: 'UUID del mensaje' })
  updateStatus(@Param('id') id: string, @Body() dto: UpdateContactMessageDto) {
    return this.contactService.updateStatus(id, dto);
  }

  @Delete(':id')
  @Auth(ValidRoles.admin)
  @ApiBearerAuth()
  @ApiOperation({ summary: '[Admin] Eliminar un mensaje de contacto' })
  @ApiParam({ name: 'id', description: 'UUID del mensaje' })
  remove(@Param('id') id: string) {
    return this.contactService.remove(id);
  }
}
