import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { PaymentModule } from '../payment/payment.module.js';
import { DatabaseModule } from '../../shared/database/database.module.js';
import { RECOMMENDATION_DATA_PORT } from './application/ports/recommendation-data.port.js';
import { PostgresRecommendationDataAdapter } from './infrastructure/adapters/postgres-recommendation-data.adapter.js';
import { PersonalizedRecommendationService } from './application/use-case/personalized-recommendation.service.js';
import { RecommendationController } from './presentation/recommendation.controller.js';
@Module({
  imports: [AuthModule, DatabaseModule, PaymentModule],
  controllers: [RecommendationController],
  providers: [
    PersonalizedRecommendationService,
    PostgresRecommendationDataAdapter,
    {
      provide: RECOMMENDATION_DATA_PORT,
      useExisting: PostgresRecommendationDataAdapter,
    },
  ],
})
export class RecommendationModule {}
