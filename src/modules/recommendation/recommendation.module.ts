import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { PersonalizedRecommendationService } from './application/personalized-recommendation.service.js';
import { RecommendationController } from './presentation/recommendation.controller.js';
@Module({
  imports: [AuthModule],
  controllers: [RecommendationController],
  providers: [PersonalizedRecommendationService],
})
export class RecommendationModule {}
