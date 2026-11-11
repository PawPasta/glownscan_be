import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AuthModule } from '../auth/auth.module.js';
import { CloudinaryModule } from '../cloudinary/cloudinary.module.js';
import { GEMINI_GENERATIVE_MODEL_PORT } from './application/ports/gemini-generative-model.port.js';
import { SkinAnalysisService } from './application/use-case/skin-analysis.service.js';
import { GeminiGenerativeModelAdapter } from './infrastructure/adapters/gemini-generative-model.adapter.js';
import { SkinAnalysisController } from './presentation/skin-analysis.controller.js';
import { ANALYSIS_QUOTA_PORT } from './application/ports/analysis-quota.port.js';
import { PostgresAnalysisQuotaAdapter } from './infrastructure/adapters/postgres-analysis-quota.adapter.js';
import { PostgresAnalysisSessionAdapter } from './infrastructure/adapters/postgres-analysis-session.adapter.js';
import { ANALYSIS_SESSION_PORT } from './application/ports/analysis-session.port.js';
import { RateLimitModule } from '../../shared/rate-limit/rate-limit.module.js';
import { IMAGE_DOWNLOADER_PORT } from './application/ports/image-downloader.port.js';
import { CloudinaryImageDownloader } from './infrastructure/adapters/cloudinary-image-downloader.js';

@Module({
  imports: [ConfigModule, AuthModule, CloudinaryModule, RateLimitModule],
  controllers: [SkinAnalysisController],
  providers: [
    GeminiGenerativeModelAdapter,
    CloudinaryImageDownloader,
    PostgresAnalysisQuotaAdapter,
    PostgresAnalysisSessionAdapter,
    SkinAnalysisService,
    {
      provide: GEMINI_GENERATIVE_MODEL_PORT,
      useExisting: GeminiGenerativeModelAdapter,
    },
    { provide: IMAGE_DOWNLOADER_PORT, useExisting: CloudinaryImageDownloader },
    { provide: ANALYSIS_QUOTA_PORT, useExisting: PostgresAnalysisQuotaAdapter },
    {
      provide: ANALYSIS_SESSION_PORT,
      useExisting: PostgresAnalysisSessionAdapter,
    },
  ],
  exports: [GEMINI_GENERATIVE_MODEL_PORT],
})
export class SkinAnalysisModule {}
