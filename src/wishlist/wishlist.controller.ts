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
import { WishlistService } from './wishlist.service';
import { CreateWishlistDto } from './dto/create-wishlist.dto';
import {
  AddWishlistItemDto,
  UpdateWishlistDto,
  UpdateWishlistItemsDto,
} from './dto/update-wishlist.dto';
import { Auth } from '../users/decorators/auth.decorators';
import { GetUser } from '../users/decorators/get-user.decorator';
import { ValidRoles } from '../users/interfaces';
import { PaginationDto } from '../common/dto/pagination.dto';

@ApiTags('wishlist')
@ApiBearerAuth()
@Auth()
@Controller('wishlist')
export class WishlistController {
  constructor(private readonly wishlistService: WishlistService) {}

  private checkOwnership(authUser: User, userId: string): void {
    if (authUser.role !== 'admin' && authUser.id !== userId) {
      throw new ForbiddenException('No tienes acceso a la wishlist de otro usuario');
    }
  }

  // ── Admin ────────────────────────────────────────────────────────────────

  @Post()
  @Auth(ValidRoles.admin)
  @ApiOperation({ summary: '[Admin] Crear una wishlist para un usuario' })
  @ApiResponse({ status: 201, description: 'Wishlist creada correctamente.' })
  @ApiResponse({ status: 403, description: 'Sin permisos suficientes.' })
  create(@Body() createWishlistDto: CreateWishlistDto) {
    return this.wishlistService.create(createWishlistDto);
  }

  @Get()
  @Auth(ValidRoles.admin)
  @ApiOperation({ summary: '[Admin] Obtener todas las wishlists' })
  @ApiResponse({ status: 200, description: 'Lista de wishlists.' })
  @ApiResponse({ status: 403, description: 'Sin permisos suficientes.' })
  findAll(@Query() paginationDto: PaginationDto) {
    return this.wishlistService.findAll(paginationDto);
  }

  @Get(':id')
  @Auth(ValidRoles.admin)
  @ApiOperation({ summary: '[Admin] Obtener una wishlist por ID interno' })
  @ApiParam({ name: 'id', description: 'ID de la wishlist (cuid)' })
  @ApiResponse({ status: 200, description: 'Wishlist encontrada.' })
  @ApiResponse({ status: 403, description: 'Sin permisos suficientes.' })
  @ApiResponse({ status: 404, description: 'Wishlist no encontrada.' })
  findOne(@Param('id') id: string) {
    return this.wishlistService.findOne(id);
  }

  @Patch(':id')
  @Auth(ValidRoles.admin)
  @ApiOperation({ summary: '[Admin] Actualizar una wishlist' })
  @ApiParam({ name: 'id', description: 'ID de la wishlist (cuid)' })
  @ApiResponse({ status: 200, description: 'Wishlist actualizada.' })
  @ApiResponse({ status: 403, description: 'Sin permisos suficientes.' })
  update(@Param('id') id: string, @Body() updateWishlistDto: UpdateWishlistDto) {
    return this.wishlistService.update(id, updateWishlistDto);
  }

  @Delete(':id')
  @Auth(ValidRoles.admin)
  @ApiOperation({ summary: '[Admin] Eliminar una wishlist' })
  @ApiParam({ name: 'id', description: 'ID de la wishlist (cuid)' })
  @ApiResponse({ status: 200, description: 'Wishlist eliminada.' })
  @ApiResponse({ status: 403, description: 'Sin permisos suficientes.' })
  remove(@Param('id') id: string) {
    return this.wishlistService.remove(id);
  }

  // ── Customer (con verificación de pertenencia) ───────────────────────────

  @Get('user/:userId')
  @ApiOperation({ summary: 'Obtener la wishlist propia' })
  @ApiParam({ name: 'userId', description: 'ID del usuario (cuid)' })
  @ApiResponse({ status: 200, description: 'Wishlist del usuario.' })
  @ApiResponse({ status: 403, description: 'No puedes acceder a la wishlist de otro usuario.' })
  findByUser(@Param('userId') userId: string, @GetUser() authUser: User) {
    this.checkOwnership(authUser, userId);
    return this.wishlistService.findByUserId(userId);
  }

  @Post('user/:userId/items')
  @ApiOperation({ summary: 'Agregar un producto a la wishlist' })
  @ApiParam({ name: 'userId', description: 'ID del usuario (cuid)' })
  @ApiResponse({ status: 201, description: 'Producto agregado a la wishlist.' })
  @ApiResponse({ status: 403, description: 'No puedes modificar la wishlist de otro usuario.' })
  addProduct(
    @Param('userId') userId: string,
    @Body() body: AddWishlistItemDto,
    @GetUser() authUser: User,
  ) {
    this.checkOwnership(authUser, userId);
    return this.wishlistService.addProduct(userId, body.productId);
  }

  @Patch('user/:userId/items')
  @ApiOperation({ summary: 'Reemplazar todos los productos de la wishlist' })
  @ApiParam({ name: 'userId', description: 'ID del usuario (cuid)' })
  @ApiResponse({ status: 200, description: 'Wishlist actualizada.' })
  @ApiResponse({ status: 403, description: 'No puedes modificar la wishlist de otro usuario.' })
  replaceItems(
    @Param('userId') userId: string,
    @Body() body: UpdateWishlistItemsDto,
    @GetUser() authUser: User,
  ) {
    this.checkOwnership(authUser, userId);
    return this.wishlistService.replaceItems(userId, body.productIds);
  }

  @Delete('user/:userId/items/:productId')
  @ApiOperation({ summary: 'Eliminar un producto de la wishlist' })
  @ApiParam({ name: 'userId', description: 'ID del usuario (cuid)' })
  @ApiParam({ name: 'productId', description: 'ID del producto (cuid)' })
  @ApiResponse({ status: 200, description: 'Producto eliminado de la wishlist.' })
  @ApiResponse({ status: 403, description: 'No puedes modificar la wishlist de otro usuario.' })
  removeProduct(
    @Param('userId') userId: string,
    @Param('productId') productId: string,
    @GetUser() authUser: User,
  ) {
    this.checkOwnership(authUser, userId);
    return this.wishlistService.removeProduct(userId, productId);
  }
}
