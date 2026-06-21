import { Controller, Post, Body, UseGuards, Req, Get, Param } from '@nestjs/common';
import type { Request } from 'express';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { OrdersService } from './orders.service';
import { CreatePublicOrderDto } from './dto/create-public-order.dto';
import { OptionalJwtAuthGuard } from '../users/guards/optional-jwt.guard';

@ApiTags('orders')
@Controller('checkout')
export class CheckoutController {
  constructor(private readonly ordersService: OrdersService) {}

  @UseGuards(OptionalJwtAuthGuard)
  @Post()
  @ApiOperation({
    summary:
      'Checkout público (invitado): registra al comprador como customer y crea el pedido (PENDING)',
  })
  @ApiResponse({ status: 201, description: 'Pedido creado en estado PENDING.' })
  create(@Body() dto: CreatePublicOrderDto, @Req() req: Request) {
    return this.ordersService.createCheckout(dto, (req as any).user ?? null);
  }

  // OptionalJwtAuthGuard: la ruta es pública, pero si llega un token válido se
  // resuelve el usuario para permitir que el dueño/admin vean un seguimiento
  // cuya ventana pública ya expiró.
  @UseGuards(OptionalJwtAuthGuard)
  @Get(':id')
  @ApiOperation({ summary: 'Seguimiento público de un pedido por su id (datos mínimos)' })
  @ApiResponse({ status: 403, description: 'Seguimiento público expirado: inicia sesión (dueño/admin).' })
  findOne(@Param('id') id: string, @Req() req: Request) {
    return this.ordersService.findOneForTracking(id, (req as any).user ?? null);
  }
}
