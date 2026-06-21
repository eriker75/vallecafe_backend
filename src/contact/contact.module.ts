import { Module } from '@nestjs/common';
import { ContactService } from './contact.service';
import { ContactController } from './contact.controller';
import { ContactsController } from './contacts.controller';
import { PrismaModule } from '../database/database.module';
import { UsersModule } from '../users/users.module';

@Module({
  imports: [PrismaModule, UsersModule],
  controllers: [ContactController, ContactsController],
  providers: [ContactService],
})
export class ContactModule {}
