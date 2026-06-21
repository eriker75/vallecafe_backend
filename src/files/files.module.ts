import { Global, Module } from '@nestjs/common';
import { FilesController } from './files.controller';
import { UsersModule } from '../users/users.module';
import { FileService } from './file.service';
import { LocalStorageService } from './storage/local-storage.service';
import { S3StorageService } from './storage/s3-storage.service';
import { GcsStorageService } from './storage/gcs-storage.service';

@Global()
@Module({
  imports: [UsersModule],
  controllers: [FilesController],
  providers: [
    LocalStorageService,
    S3StorageService,
    GcsStorageService,
    FileService,
  ],
  exports: [FileService],
})
export class FilesModule {}
