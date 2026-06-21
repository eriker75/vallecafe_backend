import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  ForbiddenException,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags, ApiOperation, ApiResponse, ApiParam } from '@nestjs/swagger';
import { User } from '../users/entities/user.entity';
import { OrdersService } from './orders.service';
import { CreateOrderDto } from './dto/create-order.dto';
import { UpdateOrderDto } from './dto/update-order.dto';
import { OrderAnalyticsQueryDto } from './dto/order-analytics-query.dto';
import { ProductProfitabilityQueryDto } from './dto/product-profitability-query.dto';
import { Auth } from '../users/decorators/auth.decorators';
import { GetUser } from '../users/decorators/get-user.decorator';
import { ValidRoles } from '../users/interfaces';
import { OrderQueryDto } from './dto/order-query.dto';

@ApiTags('orders')
@ApiBearerAuth()
@Auth()
@Controller('orders')
export class OrdersController {
  constructor(private readonly ordersService: OrdersService) {}

  // ── Admin ────────────────────────────────────────────────────────────────
  // Rutas estáticas ANTES que las paramétricas (:id) para evitar conflictos

  @Get('stats')
  @Auth(ValidRoles.admin)
  @ApiOperation({ summary: '[Admin] Conteo de pedidos por estado' })
  getOrderStats() {
    return this.ordersService.getOrderStats();
  }

  @Get('analytics')
  @Auth(ValidRoles.admin)
  @ApiOperation({ summary: '[Admin] Datos agregados de ventas e ingresos por período' })
  @ApiResponse({ status: 200, description: 'Array de puntos {label, ventas, ingresos}' })
  getAnalytics(@Query() dto: OrderAnalyticsQueryDto) {
    return this.ordersService.getAnalytics(dto);
  }

  @Get('locations')
  @Auth(ValidRoles.admin)
  @ApiOperation({ summary: '[Admin] Coordenadas de las compras (para el mapa de direcciones)' })
  @ApiResponse({ status: 200, description: 'Array de {orderId, latitude, longitude, ...}' })
  getOrderLocations() {
    return this.ordersService.getOrderLocations();
  }

  @Get('finance-analytics')
  @Auth(ValidRoles.admin)
  @ApiOperation({ summary: '[Admin] Finanzas por período: ingresos, COGS, utilidad y margen' })
  @ApiResponse({ status: 200, description: 'Array de {label, ingresos, costos, utilidad, margen}' })
  getFinanceAnalytics(@Query() dto: OrderAnalyticsQueryDto) {
    return this.ordersService.getFinanceAnalytics(dto);
  }

  @Get('product-profitability')
  @Auth(ValidRoles.admin)
  @ApiOperation({ summary: '[Admin] Rentabilidad por producto (ingresos, COGS, utilidad, margen, markup)' })
  @ApiResponse({ status: 200, description: 'Array por producto, ordenado por utilidad desc' })
  getProductProfitability(@Query() query: ProductProfitabilityQueryDto) {
    return this.ordersService.getProductProfitability(query);
  }

  @Get()
  @Auth(ValidRoles.admin)
  @ApiOperation({ summary: '[Admin] Listar pedidos con filtros y paginación' })
  @ApiResponse({ status: 200, description: 'Lista de pedidos.' })
  findAll(@Query() queryDto: OrderQueryDto) {
    return this.ordersService.findAll(queryDto);
  }

  @Patch(':id')
  @Auth(ValidRoles.admin)
  @ApiOperation({ summary: '[Admin] Actualizar estado de un pedido' })
  @ApiParam({ name: 'id', description: 'ID del pedido (uuid)' })
  update(@Param('id') id: string, @Body() updateOrderDto: UpdateOrderDto) {
    return this.ordersService.update(id, updateOrderDto);
  }

  @Delete(':id')
  @Auth(ValidRoles.admin)
  @ApiOperation({ summary: '[Admin] Eliminar un pedido' })
  @ApiParam({ name: 'id', description: 'ID del pedido (uuid)' })
  remove(@Param('id') id: string) {
    return this.ordersService.remove(id);
  }

  // ── Customer ─────────────────────────────────────────────────────────────
  // Rutas paramétricas al final para no capturar las rutas estáticas

  @Get('me')
  @ApiOperation({ summary: 'Pedidos del cliente autenticado' })
  findMine(@GetUser() authUser: User) {
    return this.ordersService.findByUser(authUser.id);
  }

  @Post()
  @ApiOperation({ summary: 'Crear un nuevo pedido' })
  create(@Body() createOrderDto: CreateOrderDto, @GetUser() authUser: User) {
    if (authUser.role !== 'admin' && createOrderDto.userId !== authUser.id) {
      throw new ForbiddenException('No puedes crear pedidos para otro usuario');
    }
    return this.ordersService.create(createOrderDto);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Obtener un pedido por ID' })
  @ApiParam({ name: 'id', description: 'ID del pedido (uuid)' })
  async findOne(@Param('id') id: string, @GetUser() authUser: User) {
    const order = await this.ordersService.findOne(id);
    if (authUser.role !== 'admin' && order.userId !== authUser.id) {
      throw new ForbiddenException('No tienes acceso a este pedido');
    }
    return order;
  }
}
