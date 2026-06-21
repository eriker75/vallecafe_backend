import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { R4WebhooksService } from './webhooks.service';
import { WebhooksController } from './webhooks.controller';
import { LoyaltyModule } from '../loyalty/loyalty.module';

// El servicio usa PrismaService (global), ConfigService (global) y LoyaltyService
// (para acreditar puntos al confirmar el abono). Confirma el abono de forma
// atómica directamente sobre `payments`/`orders`, por lo que NO depende de PaymentsModule.
@Module({
  imports: [ConfigModule, LoyaltyModule],
  controllers: [WebhooksController],
  providers: [R4WebhooksService],
})
export class WebhooksModule {}
