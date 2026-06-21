import { Body, Controller, Get, Param, Patch, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiParam, ApiTags } from '@nestjs/swagger';
import { PaymentsService } from './payments.service';
import { UpdatePaymentStatusDto } from './dto/update-payment-status.dto';
import { QueryPaymentDto } from './dto/query-payment.dto';
import { Auth } from '../users/decorators/auth.decorators';
import { ValidRoles } from '../users/interfaces';

@ApiTags('orders')
@ApiBearerAuth()
@Controller('payments')
export class PaymentsController {
  constructor(private readonly paymentsService: PaymentsService) {}

  @Get()
  @Auth(ValidRoles.admin)
  @ApiBearerAuth()
  @ApiOperation({ summary: '[Admin] Listar pagos con filtro opcional por estado' })
  findAll(@Query() dto: QueryPaymentDto) {
    return this.paymentsService.findAll(dto);
  }

  @Patch(':id')
  @Auth(ValidRoles.admin)
  @ApiOperation({ summary: '[Admin] Actualizar el estado de un pago' })
  @ApiParam({ name: 'id', description: 'ID del pago (uuid)' })
  updateStatus(@Param('id') id: string, @Body() dto: UpdatePaymentStatusDto) {
    return this.paymentsService.updateStatus(id, dto.status);
  }
}
