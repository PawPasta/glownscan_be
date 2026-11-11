import {
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import {
  CurrentUser,
  type SecurityContext,
} from '../../../shared/security/security.context.js';
import { JwtAuthGuard } from '../../../shared/security/jwt-auth.guard.js';
import { SkinAnalysisService } from '../application/use-case/skin-analysis.service.js';
import {
  AnalysisHistoryQueryDto,
  ConfirmSkinAnalysisUploadDto,
} from './skin-analysis.dto.js';
import { RateLimit } from '../../../shared/rate-limit/rate-limit.decorator.js';
import { RateLimitGuard } from '../../../shared/rate-limit/rate-limit.guard.js';

@ApiTags('skin-analysis')
@ApiBearerAuth('access-token')
@UseGuards(JwtAuthGuard)
@Controller('skin-analysis')
export class SkinAnalysisController {
  constructor(private readonly skinAnalysis: SkinAnalysisService) {}

  @Post('upload-intent')
  @UseGuards(RateLimitGuard)
  @RateLimit({
    scope: 'skin-analysis-upload-intent',
    key: 'USER',
    limit: 10,
    windowSeconds: 60,
  })
  createUploadIntent(@CurrentUser() user: SecurityContext) {
    return this.skinAnalysis.createUploadIntent(user.userId);
  }

  @Post('analyze')
  @HttpCode(HttpStatus.ACCEPTED)
  @UseGuards(RateLimitGuard)
  @RateLimit({
    scope: 'skin-analysis-analyze',
    key: 'USER',
    limit: 5,
    windowSeconds: 60,
  })
  analyze(
    @CurrentUser() user: SecurityContext,
    @Body() body: ConfirmSkinAnalysisUploadDto,
    @Headers('idempotency-key') idempotencyKey?: string,
  ) {
    return this.skinAnalysis.analyzeCloudinaryImage(
      user.userId,
      body,
      idempotencyKey,
    );
  }

  @Get()
  history(
    @CurrentUser() user: SecurityContext,
    @Query() query: AnalysisHistoryQueryDto,
  ) {
    return this.skinAnalysis.listSessions(user.userId, query.page, query.limit);
  }

  @Get(':sessionId')
  status(
    @CurrentUser() user: SecurityContext,
    @Param('sessionId') sessionId: string,
  ) {
    return this.skinAnalysis.getSession(user.userId, sessionId);
  }
}
