import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AuthModule } from './modules/auth/auth.module.js';
import { SkinAnalysisModule } from './modules/skin-analysis/skin-analysis.module.js';
import { DatabaseModule } from './shared/database/database.module.js';
import { HealthController } from './shared/database/health.controller.js';
import { RateLimitModule } from './shared/rate-limit/rate-limit.module.js';
import { PaymentModule } from './modules/payment/payment.module.js';
import { CatalogModule } from './modules/catalog/catalog.module.js';
import { RecommendationModule } from './modules/recommendation/recommendation.module.js';
import { validateEnvironment } from './shared/config/environment.validation.js';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: ['.env.local', '.env'],
      validate: validateEnvironment,
    }),
    DatabaseModule,
    RateLimitModule,
    AuthModule,
    SkinAnalysisModule,
    PaymentModule,
    CatalogModule,
    RecommendationModule,
  ],
  controllers: [HealthController],
  providers: [],
})
export class AppModule {}
