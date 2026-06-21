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
import { AddressService } from './address.service';
import { CreateAddressDto } from './dto/create-address.dto';
import { UpdateAddressDto } from './dto/update-address.dto';
import { Auth } from '../users/decorators/auth.decorators';
import { GetUser } from '../users/decorators/get-user.decorator';
import { ValidRoles } from '../users/interfaces';
import { PaginationDto } from '../common/dto/pagination.dto';

@ApiTags('addresses')
@ApiBearerAuth()
@Auth()
@Controller('addresses')
export class AddressController {
  constructor(private readonly addressService: AddressService) {}

  // ── Admin ────────────────────────────────────────────────────────────────
  // Ruta estática DELANTE de las paramétricas (`:id`) para que "admin" no se
  // interprete como un id de dirección.

  @Get('admin/all')
  @Auth(ValidRoles.admin)
  @ApiOperation({
    summary: '[Admin] Todas las direcciones con su usuario propietario',
  })
  @ApiResponse({ status: 200, description: 'Lista paginada de direcciones.' })
  @ApiResponse({ status: 403, description: 'Sin permisos suficientes.' })
  findAllForAdmin(@Query() paginationDto: PaginationDto) {
    return this.addressService.findAllForAdmin(paginationDto);
  }

  // ── Customer ─────────────────────────────────────────────────────────────

  // El userId de la dirección debe coincidir con el usuario autenticado
  @Post()
  @ApiOperation({ summary: 'Crear una nueva dirección de envío' })
  @ApiResponse({ status: 201, description: 'Dirección creada correctamente.' })
  @ApiResponse({ status: 400, description: 'Datos inválidos.' })
  @ApiResponse({ status: 403, description: 'No puedes crear direcciones para otro usuario.' })
  create(@Body() createAddressDto: CreateAddressDto, @GetUser() authUser: User) {
    if (authUser.role !== 'admin' && createAddressDto.userId !== authUser.id) {
      throw new ForbiddenException('No puedes crear direcciones para otro usuario');
    }
    return this.addressService.create(createAddressDto);
  }

  // Ownership: el customer solo puede ver / editar / borrar sus propias direcciones
  @Get(':id')
  @ApiOperation({ summary: 'Obtener una dirección por ID' })
  @ApiParam({ name: 'id', description: 'ID de la dirección (cuid)' })
  @ApiResponse({ status: 200, description: 'Dirección encontrada.' })
  @ApiResponse({ status: 403, description: 'No tienes acceso a esta dirección.' })
  @ApiResponse({ status: 404, description: 'Dirección no encontrada.' })
  async findOne(@Param('id') id: string, @GetUser() authUser: User) {
    const address = await this.addressService.findOne(id);
    if (authUser.role !== 'admin' && address.userId !== authUser.id) {
      throw new ForbiddenException('No tienes acceso a esta dirección');
    }
    return address;
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Actualizar una dirección' })
  @ApiParam({ name: 'id', description: 'ID de la dirección (cuid)' })
  @ApiResponse({ status: 200, description: 'Dirección actualizada.' })
  @ApiResponse({ status: 403, description: 'No puedes modificar la dirección de otro usuario.' })
  @ApiResponse({ status: 404, description: 'Dirección no encontrada.' })
  async update(
    @Param('id') id: string,
    @Body() updateAddressDto: UpdateAddressDto,
    @GetUser() authUser: User,
  ) {
    const address = await this.addressService.findOne(id);
    if (authUser.role !== 'admin' && address.userId !== authUser.id) {
      throw new ForbiddenException('No puedes modificar la dirección de otro usuario');
    }
    return this.addressService.update(id, updateAddressDto);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Eliminar una dirección' })
  @ApiParam({ name: 'id', description: 'ID de la dirección (cuid)' })
  @ApiResponse({ status: 200, description: 'Dirección eliminada.' })
  @ApiResponse({ status: 403, description: 'No puedes eliminar la dirección de otro usuario.' })
  @ApiResponse({ status: 404, description: 'Dirección no encontrada.' })
  async remove(@Param('id') id: string, @GetUser() authUser: User) {
    const address = await this.addressService.findOne(id);
    if (authUser.role !== 'admin' && address.userId !== authUser.id) {
      throw new ForbiddenException('No puedes eliminar la dirección de otro usuario');
    }
    return this.addressService.remove(id);
  }

  // ── Admin ────────────────────────────────────────────────────────────────

  @Get()
  @Auth(ValidRoles.admin)
  @ApiOperation({ summary: '[Admin] Obtener todas las direcciones' })
  @ApiResponse({ status: 200, description: 'Lista de direcciones.' })
  @ApiResponse({ status: 403, description: 'Sin permisos suficientes.' })
  findAll(@Query() paginationDto: PaginationDto) {
    return this.addressService.findAll(paginationDto);
  }
}
