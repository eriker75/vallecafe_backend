import { Module } from '@nestjs/common';
import { BcvService } from './bcv.service';
import { BcvController } from './bcv.controller';
import { UsersModule } from '../users/users.module';
import { R4Module } from '../r4/r4.module';

@Module({
  imports: [UsersModule, R4Module],
  controllers: [BcvController],
  providers: [BcvService],
  exports: [BcvService],
})
export class BcvModule {}
