import { Controller, Get, Post, Body, Patch, Param, Delete, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags, ApiOperation, ApiResponse, ApiParam } from '@nestjs/swagger';
import { ProductsService } from './products.service';
import { CreateProductDto } from './dto/create-product.dto';
import { UpdateProductDto } from './dto/update-product.dto';
import { AdjustStockDto } from './dto/adjust-stock.dto';
import { FilterProductsDto } from './dto/filter-products.dto';
import { Auth } from '../users/decorators/auth.decorators';
import { OptionalJwtAuthGuard } from '../users/guards/optional-jwt.guard';
import { OptionalUser } from '../users/decorators/optional-user.decorator';
import { ValidRoles } from '../users/interfaces';
import { BulkImportDto } from '../common/dto/bulk-import.dto';

// Datos mínimos del visor para resolver la visibilidad/precio del catálogo.
export type ProductViewer = { role?: string; accountType?: string } | null;

@ApiTags('products')
@Controller('products')
export class ProductsController {
  constructor(private readonly productsService: ProductsService) { }

  // Admin: crear producto
  @Post()
  @Auth(ValidRoles.admin)
  @ApiBearerAuth()
  @ApiOperation({ summary: '[Admin] Crear un nuevo producto' })
  @ApiResponse({ status: 201, description: 'Producto creado correctamente.' })
  @ApiResponse({ status: 401, description: 'No autenticado.' })
  @ApiResponse({ status: 403, description: 'Sin permisos suficientes.' })
  create(@Body() createProductDto: CreateProductDto) {
    return this.productsService.create(createProductDto);
  }

  // Admin: importación masiva desde CSV (crear / actualizar / upsert)
  @Post('bulk')
  @Auth(ValidRoles.admin)
  @ApiBearerAuth()
  @ApiOperation({ summary: '[Admin] Importar productos en lote (CSV)' })
  @ApiResponse({ status: 201, description: 'Reporte de importación.' })
  bulkImport(@Body() bulkImportDto: BulkImportDto) {
    return this.productsService.bulkImport(bulkImportDto);
  }

  // Público (auth opcional): catálogo de productos con filtros (búsqueda, categoría,
  // precio, puntos, tueste, origen, etiqueta, disponibilidad) y ordenamiento. El
  // usuario autenticado modula la VISIBILIDAD: un mayorista (B2B) ve también los
  // productos WHOLESALE_ONLY; un minorista/invitado solo ALL+RETAIL_ONLY; el admin
  // ve todo (el panel usa este mismo endpoint).
  @Get()
  @UseGuards(OptionalJwtAuthGuard)
  @ApiOperation({ summary: 'Obtener productos con filtros y paginación' })
  @ApiResponse({ status: 200, description: 'Lista de productos.' })
  findAll(@Query() filterDto: FilterProductsDto, @OptionalUser() viewer: ProductViewer) {
    return this.productsService.findAll(filterDto, viewer);
  }

  // Público (auth opcional): detalle de producto. Devuelve 404 si el producto no es
  // visible para el visor (evita fuga de productos exclusivos por URL directa).
  @Get(':id')
  @UseGuards(OptionalJwtAuthGuard)
  @ApiOperation({ summary: 'Obtener un producto por ID' })
  @ApiParam({ name: 'id', description: 'ID del producto (cuid)' })
  @ApiResponse({ status: 200, description: 'Producto encontrado.' })
  @ApiResponse({ status: 404, description: 'Producto no encontrado.' })
  findOne(@Param('id') id: string, @OptionalUser() viewer: ProductViewer) {
    return this.productsService.findOne(id, viewer);
  }

  // Admin: ajustar stock de forma relativa y atómica (sumar/restar)
  @Patch(':id/stock')
  @Auth(ValidRoles.admin)
  @ApiBearerAuth()
  @ApiOperation({ summary: '[Admin] Sumar o restar unidades al stock (atómico)' })
  @ApiParam({ name: 'id', description: 'ID del producto (uuid)' })
  @ApiResponse({ status: 200, description: 'Stock ajustado.' })
  @ApiResponse({ status: 400, description: 'Stock insuficiente para restar.' })
  @ApiResponse({ status: 404, description: 'Producto no encontrado.' })
  adjustStock(@Param('id') id: string, @Body() adjustStockDto: AdjustStockDto) {
    return this.productsService.adjustStock(id, adjustStockDto);
  }

  // Admin: editar producto
  @Patch(':id')
  @Auth(ValidRoles.admin)
  @ApiBearerAuth()
  @ApiOperation({ summary: '[Admin] Actualizar un producto' })
  @ApiParam({ name: 'id', description: 'ID del producto (cuid)' })
  @ApiResponse({ status: 200, description: 'Producto actualizado.' })
  @ApiResponse({ status: 401, description: 'No autenticado.' })
  @ApiResponse({ status: 403, description: 'Sin permisos suficientes.' })
  @ApiResponse({ status: 404, description: 'Producto no encontrado.' })
  update(@Param('id') id: string, @Body() updateProductDto: UpdateProductDto) {
    return this.productsService.update(id, updateProductDto);
  }

  // Admin: eliminar producto
  @Delete(':id')
  @Auth(ValidRoles.admin)
  @ApiBearerAuth()
  @ApiOperation({ summary: '[Admin] Eliminar un producto' })
  @ApiParam({ name: 'id', description: 'ID del producto (cuid)' })
  @ApiResponse({ status: 200, description: 'Producto eliminado.' })
  @ApiResponse({ status: 401, description: 'No autenticado.' })
  @ApiResponse({ status: 403, description: 'Sin permisos suficientes.' })
  @ApiResponse({ status: 404, description: 'Producto no encontrado.' })
  remove(@Param('id') id: string) {
    return this.productsService.remove(id);
  }
}
