import { Module } from '@nestjs/common';
import { HealthController } from './health.controller';
import { UsersModule } from '../users/users.module';

// Diagnósticos del servicio (solo admin), p. ej. la IP de salida (Cloud NAT).
@Module({
  imports: [UsersModule],
  controllers: [HealthController],
})
export class HealthModule {}
