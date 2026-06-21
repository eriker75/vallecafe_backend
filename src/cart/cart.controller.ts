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
import { CartService } from './cart.service';
import { CreateCartDto } from './dto/create-cart.dto';
import {
  AddCartItemDto,
  ApplyCartCouponDto,
  ReplaceCartItemsDto,
  UpdateCartDto,
  UpdateCartItemDto,
} from './dto/update-cart.dto';
import { Auth } from '../users/decorators/auth.decorators';
import { GetUser } from '../users/decorators/get-user.decorator';
import { ValidRoles } from '../users/interfaces';
import { PaginationDto } from '../common/dto/pagination.dto';

@ApiTags('cart')
@ApiBearerAuth()
@Auth()
@Controller('cart')
export class CartController {
  constructor(private readonly cartService: CartService) {}

  private checkOwnership(authUser: User, userId: string): void {
    if (authUser.role !== 'admin' && authUser.id !== userId) {
      throw new ForbiddenException('No tienes acceso al carrito de otro usuario');
    }
  }

  // ── Admin ────────────────────────────────────────────────────────────────

  @Post()
  @Auth(ValidRoles.admin)
  @ApiOperation({ summary: '[Admin] Crear un carrito para un usuario' })
  @ApiResponse({ status: 201, description: 'Carrito creado correctamente.' })
  @ApiResponse({ status: 403, description: 'Sin permisos suficientes.' })
  create(@Body() createCartDto: CreateCartDto) {
    return this.cartService.create(createCartDto);
  }

  @Get()
  @Auth(ValidRoles.admin)
  @ApiOperation({ summary: '[Admin] Obtener todos los carritos' })
  @ApiResponse({ status: 200, description: 'Lista de carritos.' })
  @ApiResponse({ status: 403, description: 'Sin permisos suficientes.' })
  findAll(@Query() paginationDto: PaginationDto) {
    return this.cartService.findAll(paginationDto);
  }

  @Get(':id')
  @Auth(ValidRoles.admin)
  @ApiOperation({ summary: '[Admin] Obtener un carrito por ID' })
  @ApiParam({ name: 'id', description: 'ID del carrito (uuid)' })
  @ApiResponse({ status: 200, description: 'Carrito encontrado.' })
  @ApiResponse({ status: 403, description: 'Sin permisos suficientes.' })
  @ApiResponse({ status: 404, description: 'Carrito no encontrado.' })
  findOne(@Param('id') id: string) {
    return this.cartService.findOne(id);
  }

  @Patch(':id')
  @Auth(ValidRoles.admin)
  @ApiOperation({ summary: '[Admin] Actualizar un carrito' })
  @ApiParam({ name: 'id', description: 'ID del carrito (uuid)' })
  @ApiResponse({ status: 200, description: 'Carrito actualizado.' })
  @ApiResponse({ status: 403, description: 'Sin permisos suficientes.' })
  update(@Param('id') id: string, @Body() updateCartDto: UpdateCartDto) {
    return this.cartService.update(id, updateCartDto);
  }

  @Delete(':id')
  @Auth(ValidRoles.admin)
  @ApiOperation({ summary: '[Admin] Eliminar un carrito' })
  @ApiParam({ name: 'id', description: 'ID del carrito (uuid)' })
  @ApiResponse({ status: 200, description: 'Carrito eliminado.' })
  @ApiResponse({ status: 403, description: 'Sin permisos suficientes.' })
  remove(@Param('id') id: string) {
    return this.cartService.remove(id);
  }

  // ── Customer ─────────────────────────────────────────────────────────────

  @Get('user/:userId')
  @ApiOperation({ summary: 'Obtener el carrito propio' })
  @ApiParam({ name: 'userId', description: 'ID del usuario (uuid)' })
  @ApiResponse({ status: 200, description: 'Carrito del usuario.' })
  findByUser(@Param('userId') userId: string, @GetUser() authUser: User) {
    this.checkOwnership(authUser, userId);
    return this.cartService.findByUserId(userId);
  }

  @Post('user/:userId/items')
  @ApiOperation({ summary: 'Agregar un producto al carrito' })
  @ApiParam({ name: 'userId', description: 'ID del usuario (uuid)' })
  @ApiResponse({ status: 201, description: 'Producto agregado.' })
  addProduct(
    @Param('userId') userId: string,
    @Body() body: AddCartItemDto,
    @GetUser() authUser: User,
  ) {
    this.checkOwnership(authUser, userId);
    return this.cartService.addProduct(userId, body.productId, body.quantity ?? 1);
  }

  @Patch('user/:userId/items/:productId')
  @ApiOperation({ summary: 'Actualizar la cantidad de un ítem' })
  @ApiParam({ name: 'userId', description: 'ID del usuario (uuid)' })
  @ApiParam({ name: 'productId', description: 'ID del producto (uuid)' })
  @ApiResponse({ status: 200, description: 'Cantidad actualizada.' })
  updateItemQuantity(
    @Param('userId') userId: string,
    @Param('productId') productId: string,
    @Body() body: UpdateCartItemDto,
    @GetUser() authUser: User,
  ) {
    this.checkOwnership(authUser, userId);
    return this.cartService.updateItemQuantity(userId, productId, body.quantity);
  }

  @Patch('user/:userId/items')
  @ApiOperation({ summary: 'Reemplazar todos los ítems del carrito' })
  @ApiParam({ name: 'userId', description: 'ID del usuario (uuid)' })
  @ApiResponse({ status: 200, description: 'Ítems reemplazados.' })
  replaceItems(
    @Param('userId') userId: string,
    @Body() body: ReplaceCartItemsDto,
    @GetUser() authUser: User,
  ) {
    this.checkOwnership(authUser, userId);
    return this.cartService.replaceItems(userId, body.items);
  }

  @Delete('user/:userId/items/:productId')
  @ApiOperation({ summary: 'Eliminar un producto del carrito' })
  @ApiParam({ name: 'userId', description: 'ID del usuario (uuid)' })
  @ApiParam({ name: 'productId', description: 'ID del producto (uuid)' })
  @ApiResponse({ status: 200, description: 'Producto eliminado.' })
  removeProduct(
    @Param('userId') userId: string,
    @Param('productId') productId: string,
    @GetUser() authUser: User,
  ) {
    this.checkOwnership(authUser, userId);
    return this.cartService.removeProduct(userId, productId);
  }

  @Delete('user/:userId/items')
  @ApiOperation({ summary: 'Vaciar el carrito' })
  @ApiParam({ name: 'userId', description: 'ID del usuario (uuid)' })
  @ApiResponse({ status: 200, description: 'Carrito vaciado.' })
  clearByUser(@Param('userId') userId: string, @GetUser() authUser: User) {
    this.checkOwnership(authUser, userId);
    return this.cartService.clearByUser(userId);
  }

  @Post('user/:userId/coupon')
  @ApiOperation({ summary: 'Aplicar un cupón al carrito' })
  @ApiParam({ name: 'userId', description: 'ID del usuario (uuid)' })
  @ApiResponse({ status: 201, description: 'Cupón aplicado.' })
  @ApiResponse({ status: 400, description: 'Cupón inválido o no aplicable.' })
  @ApiResponse({ status: 404, description: 'Cupón no encontrado.' })
  applyCoupon(
    @Param('userId') userId: string,
    @Body() body: ApplyCartCouponDto,
    @GetUser() authUser: User,
  ) {
    this.checkOwnership(authUser, userId);
    return this.cartService.applyCoupon(userId, body.couponCode);
  }

  @Delete('user/:userId/coupon')
  @ApiOperation({ summary: 'Quitar el cupón del carrito' })
  @ApiParam({ name: 'userId', description: 'ID del usuario (uuid)' })
  @ApiResponse({ status: 200, description: 'Cupón removido.' })
  removeCoupon(@Param('userId') userId: string, @GetUser() authUser: User) {
    this.checkOwnership(authUser, userId);
    return this.cartService.removeCoupon(userId);
  }
}
