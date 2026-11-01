import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AuthModule } from '../auth/auth.module.js';
import { CloudinaryModule } from '../cloudinary/cloudinary.module.js';
import { GEMINI_GENERATIVE_MODEL_PORT } from './application/ports/gemini-generative-model.port.js';
import { SkinAnalysisService } from './application/use-case/skin-analysis.service.js';
import { GeminiGenerativeModelAdapter } from './infrastructure/adapters/gemini-generative-model.adapter.js';
import { SkinAnalysisController } from './presentation/skin-analysis.controller.js';

@Module({
  imports: [ConfigModule, AuthModule, CloudinaryModule],
  controllers: [SkinAnalysisController],
  providers: [
    GeminiGenerativeModelAdapter,
    SkinAnalysisService,
    {
      provide: GEMINI_GENERATIVE_MODEL_PORT,
      useExisting: GeminiGenerativeModelAdapter,
    },
  ],
  exports: [GEMINI_GENERATIVE_MODEL_PORT],
})
export class SkinAnalysisModule {}
