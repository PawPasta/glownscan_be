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
import { SKIN_ASSESSMENT_PORT } from './application/ports/skin-assessment.port.js';
import { SkinAssessmentService } from './application/use-case/skin-assessment.service.js';
import { PostgresSkinAssessmentAdapter } from './infrastructure/adapters/postgres-skin-assessment.adapter.js';
import { SkinAssessmentController } from './presentation/skin-assessment.controller.js';
import { ANALYSIS_OUTBOX_PORT } from './application/ports/analysis-outbox.port.js';
import { PostgresAnalysisOutboxAdapter } from './infrastructure/adapters/postgres-analysis-outbox.adapter.js';
import { ANALYSIS_WORK_QUEUE_PORT } from './application/ports/analysis-work-queue.port.js';
import { BullMqAnalysisWorkQueueAdapter } from './infrastructure/adapters/bullmq-analysis-work-queue.adapter.js';
import { AnalysisOutboxDispatcher } from './infrastructure/workers/analysis-outbox-dispatcher.service.js';
import { AnalysisWorker } from './infrastructure/workers/analysis-worker.service.js';
import { NotificationModule } from '../notification/notification.module.js';
import { PaymentModule } from '../payment/payment.module.js';

@Module({
  imports: [
    ConfigModule,
    AuthModule,
    CloudinaryModule,
    RateLimitModule,
    NotificationModule,
    PaymentModule,
  ],
  controllers: [SkinAnalysisController, SkinAssessmentController],
  providers: [
    GeminiGenerativeModelAdapter,
    CloudinaryImageDownloader,
    PostgresAnalysisQuotaAdapter,
    PostgresAnalysisSessionAdapter,
    PostgresAnalysisOutboxAdapter,
    BullMqAnalysisWorkQueueAdapter,
    PostgresSkinAssessmentAdapter,
    SkinAnalysisService,
    SkinAssessmentService,
    AnalysisOutboxDispatcher,
    AnalysisWorker,
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
    {
      provide: ANALYSIS_OUTBOX_PORT,
      useExisting: PostgresAnalysisOutboxAdapter,
    },
    {
      provide: ANALYSIS_WORK_QUEUE_PORT,
      useExisting: BullMqAnalysisWorkQueueAdapter,
    },
    {
      provide: SKIN_ASSESSMENT_PORT,
      useExisting: PostgresSkinAssessmentAdapter,
    },
  ],
  exports: [GEMINI_GENERATIVE_MODEL_PORT],
})
export class SkinAnalysisModule {}
