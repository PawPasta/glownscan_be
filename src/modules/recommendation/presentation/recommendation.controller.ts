import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { IsInt, IsOptional, Max, Min } from 'class-validator';
import { JwtAuthGuard } from '../../../shared/security/jwt-auth.guard.js';
import {
  AccessPermissionGuard,
  RequirePermission,
} from '../../../shared/security/access-permission.guard.js';
import {
  CurrentUser,
  type SecurityContext,
} from '../../../shared/security/security.context.js';
import { PersonalizedRecommendationService } from '../application/use-case/personalized-recommendation.service.js';
class RecommendationQueryDto {
  @IsOptional() @IsInt() @Min(1) @Max(50) limit = 12;
}
@ApiTags('recommendations')
@ApiBearerAuth('access-token')
@UseGuards(JwtAuthGuard, AccessPermissionGuard)
@RequirePermission('RECOMMENDATION_READ')
@Controller('recommendations')
export class RecommendationController {
  constructor(
    private readonly recommendations: PersonalizedRecommendationService,
  ) {}
  @Get('me') getMine(
    @CurrentUser() user: SecurityContext,
    @Query() query: RecommendationQueryDto,
  ) {
    return this.recommendations.getForUser(user.userId, query.limit);
  }
}
