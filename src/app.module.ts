import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { OrdersModule } from './orders/orders.module';
import { ProductsModule } from './products/products.module';
import { NotificationsModule } from './notifications/notifications.module';
import { CartModule } from './cart/cart.module';
import { WishlistModule } from './wishlist/wishlist.module';
import { UsersModule } from './users/users.module';
import { CategoryModule } from './category/category.module';
import { TagsModule } from './tags/tags.module';
import { AddressModule } from './address/address.module';
import { CouponsModule } from './coupons/coupons.module';
import { BannersModule } from './banners/banners.module';
import { DatabaseModule } from './database/database.module';
import { FilesModule } from './files/files.module';
import { MailerModule } from './mailer/mailer.module';
import { SettingsModule } from './settings/settings.module';
import { ContactModule } from './contact/contact.module';
import { PaymentsModule } from './payments/payments.module';
import { BcvModule } from './bcv/bcv.module';
import { WebhooksModule } from './webhooks/webhooks.module';
import { HealthModule } from './health/health.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    DatabaseModule,
    OrdersModule,
    ProductsModule,
    NotificationsModule,
    CartModule,
    WishlistModule,
    UsersModule,
    CategoryModule,
    TagsModule,
    AddressModule,
    CouponsModule,
    BannersModule,
    FilesModule,
    MailerModule,
    SettingsModule,
    ContactModule,
    PaymentsModule,
    BcvModule,
    WebhooksModule,
    HealthModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
