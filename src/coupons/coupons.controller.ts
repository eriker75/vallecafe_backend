import { Controller, Get, Post, Body, Patch, Param, Delete, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags, ApiOperation, ApiResponse, ApiParam } from '@nestjs/swagger';
import { CouponsService } from './coupons.service';
import { CreateCouponDto } from './dto/create-coupon.dto';
import { UpdateCouponDto } from './dto/update-coupon.dto';
import { ValidateCouponDto } from './dto/validate-coupon.dto';
import { Auth } from '../users/decorators/auth.decorators';
import { ValidRoles } from '../users/interfaces';
import { PaginationDto } from '../common/dto/pagination.dto';
import { BulkImportDto } from '../common/dto/bulk-import.dto';

@ApiTags('coupons')
@Controller('coupons')
export class CouponsController {
  constructor(private readonly couponsService: CouponsService) {}

  // Admin: crear cupón
  @Post()
  @Auth(ValidRoles.admin)
  @ApiBearerAuth()
  @ApiOperation({ summary: '[Admin] Crear un nuevo cupón de descuento' })
  @ApiResponse({ status: 201, description: 'Cupón creado correctamente.' })
  @ApiResponse({ status: 401, description: 'No autenticado.' })
  @ApiResponse({ status: 403, description: 'Sin permisos suficientes.' })
  create(@Body() createCouponDto: CreateCouponDto) {
    return this.couponsService.create(createCouponDto);
  }

  // Admin: importación masiva desde CSV (crear / actualizar / upsert)
  @Post('bulk')
  @Auth(ValidRoles.admin)
  @ApiBearerAuth()
  @ApiOperation({ summary: '[Admin] Importar cupones en lote (CSV)' })
  @ApiResponse({ status: 201, description: 'Reporte de importación.' })
  bulkImport(@Body() bulkImportDto: BulkImportDto) {
    return this.couponsService.bulkImport(bulkImportDto);
  }

  // Público: validar un cupón por código (lo usa el carrito/checkout de la
  // tienda, donde el comprador puede ser invitado). No requiere autenticación.
  @Post('validate')
  @ApiOperation({ summary: 'Validar un cupón por código (público)' })
  @ApiResponse({ status: 200, description: 'Cupón válido. Devuelve tipo/monto del descuento.' })
  @ApiResponse({ status: 400, description: 'Cupón inactivo, vencido, agotado o no aplicable.' })
  @ApiResponse({ status: 404, description: 'Cupón no encontrado.' })
  validate(@Body() dto: ValidateCouponDto) {
    return this.couponsService.validateForCart(dto.code, dto.productIds);
  }

  // Autenticado: ver cupones disponibles
  @Get()
  @Auth()
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Obtener todos los cupones' })
  @ApiResponse({ status: 200, description: 'Lista de cupones.' })
  @ApiResponse({ status: 401, description: 'No autenticado.' })
  findAll(@Query() paginationDto: PaginationDto) {
    return this.couponsService.findAll(paginationDto);
  }

  // Autenticado: ver un cupón específico
  @Get(':id')
  @Auth()
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Obtener un cupón por ID' })
  @ApiParam({ name: 'id', description: 'ID del cupón (cuid)' })
  @ApiResponse({ status: 200, description: 'Cupón encontrado.' })
  @ApiResponse({ status: 401, description: 'No autenticado.' })
  @ApiResponse({ status: 404, description: 'Cupón no encontrado.' })
  findOne(@Param('id') id: string) {
    return this.couponsService.findOne(id);
  }

  // Admin: editar cupón
  @Patch(':id')
  @Auth(ValidRoles.admin)
  @ApiBearerAuth()
  @ApiOperation({ summary: '[Admin] Actualizar un cupón' })
  @ApiParam({ name: 'id', description: 'ID del cupón (cuid)' })
  @ApiResponse({ status: 200, description: 'Cupón actualizado.' })
  @ApiResponse({ status: 403, description: 'Sin permisos suficientes.' })
  @ApiResponse({ status: 404, description: 'Cupón no encontrado.' })
  update(@Param('id') id: string, @Body() updateCouponDto: UpdateCouponDto) {
    return this.couponsService.update(id, updateCouponDto);
  }

  // Admin: eliminar cupón
  @Delete(':id')
  @Auth(ValidRoles.admin)
  @ApiBearerAuth()
  @ApiOperation({ summary: '[Admin] Eliminar un cupón' })
  @ApiParam({ name: 'id', description: 'ID del cupón (cuid)' })
  @ApiResponse({ status: 200, description: 'Cupón eliminado.' })
  @ApiResponse({ status: 403, description: 'Sin permisos suficientes.' })
  @ApiResponse({ status: 404, description: 'Cupón no encontrado.' })
  remove(@Param('id') id: string) {
    return this.couponsService.remove(id);
  }
}
