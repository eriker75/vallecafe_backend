import { Body, Controller, Get, Post } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { DebitoInmediatoService } from './debito-inmediato.service';
import {
  DebitoConfirmarDto,
  DebitoOrderDto,
} from './dto/debito-inmediato.dto';

/**
 * Endpoints públicos del flujo de Débito Inmediato (soporta invitados; la
 * autorización es por posesión del UUID de la orden, igual que el seguimiento).
 * El flujo: checkout (method=debito_inmediato) → otp → confirmar [→ estado].
 */
@ApiTags('Pagos — Débito Inmediato (R4)')
@Controller('payments/debito')
export class DebitoInmediatoController {
  constructor(private readonly debito: DebitoInmediatoService) {}

  @Post('otp')
  @ApiOperation({
    summary: 'Solicita al banco el envío del OTP al teléfono del pagador',
  })
  solicitarOtp(@Body() dto: DebitoOrderDto) {
    return this.debito.solicitarOtp(dto.orderId);
  }

  @Post('confirmar')
  @ApiOperation({ summary: 'Ejecuta el débito inmediato con el OTP recibido' })
  confirmar(@Body() dto: DebitoConfirmarDto) {
    return this.debito.confirmar(dto.orderId, dto.otp);
  }

  @Post('estado')
  @ApiOperation({
    summary: 'Consulta el estado de una operación en espera (code AC00)',
  })
  consultarEstado(@Body() dto: DebitoOrderDto) {
    return this.debito.consultarEstado(dto.orderId);
  }
}

/** Datos públicos de pago: cuenta receptora + visibilidad de métodos. */
@ApiTags('Pagos — Config pública')
@Controller('payments')
export class PagoMovilInfoController {
  constructor(private readonly debito: DebitoInmediatoService) {}

  @Get('pago-movil/cuenta')
  @ApiOperation({
    summary: 'Cuenta receptora del comercio para pago móvil (banco/teléfono/RIF)',
  })
  cuenta() {
    return this.debito.getCuentaDestino();
  }

  @Get('methods')
  @ApiOperation({
    summary:
      'Config pública del checkout: cuenta receptora + qué métodos de pago se muestran (settings del admin, grupo PAYMENT)',
  })
  methods() {
    return this.debito.getPublicConfig();
  }
}
