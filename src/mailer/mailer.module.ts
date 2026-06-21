import { Module } from '@nestjs/common';
import { MailerService } from './mailer.service';

// Correos transaccionales (verificación de cuenta, recuperación de contraseña).
// ConfigModule es global (ConfigModule.forRoot({ isGlobal: true }) en AppModule),
// así que MailerService puede inyectar ConfigService sin importarlo aquí.
@Module({
  providers: [MailerService],
  exports: [MailerService],
})
export class MailerModule {}
