import { Module } from '@nestjs/common';
import { PaymentsService } from './payments.service';
import { PaymentsController } from './payments.controller';
import { UsersModule } from '../users/users.module';
import { LoyaltyModule } from '../loyalty/loyalty.module';
import { R4Module } from '../r4/r4.module';
import { DebitoInmediatoService } from './debito-inmediato.service';
import {
  DebitoInmediatoController,
  PagoMovilInfoController,
} from './debito-inmediato.controller';

@Module({
  imports: [UsersModule, LoyaltyModule, R4Module],
  controllers: [
    PaymentsController,
    DebitoInmediatoController,
    PagoMovilInfoController,
  ],
  providers: [PaymentsService, DebitoInmediatoService],
  exports: [PaymentsService],
})
export class PaymentsModule {}
