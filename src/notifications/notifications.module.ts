import { Module } from '@nestjs/common';
import { NotificationsService } from './notifications.service';
import { NotificationsController } from './notifications.controller';
import { ExpoPushService } from './push/expo-push.service';
import { PushTokensService } from './push-tokens.service';
import { PrismaModule } from '../database/database.module';
import { UsersModule } from '../users/users.module';

@Module({
  imports: [PrismaModule, UsersModule],
  controllers: [NotificationsController],
  providers: [NotificationsService, ExpoPushService, PushTokensService],
  // Exportado para que otros módulos (p.ej. orders) puedan enviar avisos push.
  exports: [NotificationsService, PushTokensService],
})
export class NotificationsModule {}
