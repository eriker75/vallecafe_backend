import { Module } from '@nestjs/common';
import { OrdersService } from './orders.service';
import { OrdersController } from './orders.controller';
import { CheckoutController } from './checkout.controller';
import { UsersModule } from '../users/users.module';
import { BcvModule } from '../bcv/bcv.module';
import { LoyaltyModule } from '../loyalty/loyalty.module';

@Module({
  imports: [UsersModule, BcvModule, LoyaltyModule],
  controllers: [OrdersController, CheckoutController],
  providers: [OrdersService],
})
export class OrdersModule {}
