import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { DatabaseModule } from '../../shared/database/database.module.js';
import { UPLOAD_INTENT_PORT } from './application/ports/upload-intent.port.js';
import { CloudinaryUploadIntentService } from './application/use-case/cloudinary-upload-intent.service.js';
import { PostgresUploadIntentAdapter } from './infrastructure/adapters/postgres-upload-intent.adapter.js';
import { CLOUDINARY_PROVIDER_PORT } from './application/ports/cloudinary-provider.port.js';
import { CloudinaryProviderAdapter } from './infrastructure/adapters/cloudinary-provider.adapter.js';

@Module({
  imports: [ConfigModule, DatabaseModule],
  providers: [
    PostgresUploadIntentAdapter,
    { provide: UPLOAD_INTENT_PORT, useExisting: PostgresUploadIntentAdapter },
    CloudinaryProviderAdapter,
    {
      provide: CLOUDINARY_PROVIDER_PORT,
      useExisting: CloudinaryProviderAdapter,
    },
    CloudinaryUploadIntentService,
  ],
  exports: [CloudinaryUploadIntentService],
})
export class CloudinaryModule {}
