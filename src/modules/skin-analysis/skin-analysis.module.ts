import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { GEMINI_GENERATIVE_MODEL_PORT } from './application/ports/gemini-generative-model.port.js';
import { GeminiGenerativeModelAdapter } from './infrastructure/adapters/gemini-generative-model.adapter.js';

@Module({
  imports: [ConfigModule],
  providers: [
    GeminiGenerativeModelAdapter,
    {
      provide: GEMINI_GENERATIVE_MODEL_PORT,
      useExisting: GeminiGenerativeModelAdapter,
    },
  ],
  exports: [GEMINI_GENERATIVE_MODEL_PORT],
})
export class SkinAnalysisModule {}
