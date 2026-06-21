import { Body, Controller, Get, Patch, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { BcvService } from './bcv.service';
import { UpdateBcvRateDto } from './dto/update-bcv-rate.dto';
import { PaginationDto } from '../common/dto/pagination.dto';
import { Auth } from '../users/decorators/auth.decorators';
import { ValidRoles } from '../users/interfaces';

@ApiTags('bcv-rate')
@Controller('bcv-rate')
export class BcvController {
  constructor(private readonly bcvService: BcvService) {}

  // PÚBLICO: el checkout muestra el monto en Bs usando esta tasa.
  @Get()
  @ApiOperation({ summary: 'Tasa BCV vigente (pública, para el checkout)' })
  async getCurrent() {
    const current = await this.bcvService.getCurrentRate();
    if (current) return current;

    // Si aún no hay ninguna tasa, intentamos poblarla una vez.
    const refreshed = await this.bcvService.refresh();
    return { rate: refreshed.rate, source: refreshed.source, updatedAt: new Date() };
  }

  @Post('refresh')
  @Auth(ValidRoles.admin)
  @ApiBearerAuth()
  @ApiOperation({ summary: '[Admin] Refrescar la tasa BCV desde el proveedor externo' })
  refresh() {
    return this.bcvService.refresh();
  }

  @Patch()
  @Auth(ValidRoles.admin)
  @ApiBearerAuth()
  @ApiOperation({ summary: '[Admin] Establecer una tasa BCV manual' })
  setManual(@Body() dto: UpdateBcvRateDto) {
    return this.bcvService.setManual(dto.rate, dto.note);
  }

  @Get('history')
  @Auth(ValidRoles.admin)
  @ApiBearerAuth()
  @ApiOperation({ summary: '[Admin] Historial paginado de tasas BCV' })
  getHistory(@Query() dto: PaginationDto) {
    return this.bcvService.getHistory(dto);
  }
}
