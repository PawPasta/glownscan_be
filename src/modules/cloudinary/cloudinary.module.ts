import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { DatabaseModule } from '../../shared/database/database.module.js';
import { UPLOAD_INTENT_PORT } from './application/ports/upload-intent.port.js';
import { CloudinaryUploadIntentService } from './application/use-case/cloudinary-upload-intent.service.js';
import { PostgresUploadIntentAdapter } from './infrastructure/adapters/postgres-upload-intent.adapter.js';

@Module({
  imports: [ConfigModule, DatabaseModule],
  providers: [
    PostgresUploadIntentAdapter,
    { provide: UPLOAD_INTENT_PORT, useExisting: PostgresUploadIntentAdapter },
    CloudinaryUploadIntentService,
  ],
  exports: [CloudinaryUploadIntentService],
})
export class CloudinaryModule {}
