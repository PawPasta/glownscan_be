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
  CreateSkinAnalysisUploadIntentDto,
  ConfirmSkinAnalysisUploadDto,
  TestAiAnalysisDto,
} from './skin-analysis.dto.js';
import { RateLimit } from '../../../shared/rate-limit/rate-limit.decorator.js';
import { RateLimitGuard } from '../../../shared/rate-limit/rate-limit.guard.js';
import { AdminGuard } from '../../../shared/security/admin.guard.js';
import { PaymentService } from '../../payment/application/use-case/payment.service.js';
import {
  AccessPermissionGuard,
  RequirePermission,
} from '../../../shared/security/access-permission.guard.js';

@ApiTags('skin-analysis')
@ApiBearerAuth('access-token')
@UseGuards(JwtAuthGuard)
@Controller('skin-analysis')
export class SkinAnalysisController {
  constructor(
    private readonly skinAnalysis: SkinAnalysisService,
    private readonly payment: PaymentService,
  ) {}

  @Get('consent-info')
  consentInfo() {
    return this.skinAnalysis.getConsentInfo();
  }

  @Post(['admin/test-ai', 'admin/test-groq', 'admin/test-gemini'])
  @UseGuards(AdminGuard, RateLimitGuard)
  @RateLimit({
    scope: 'skin-analysis-ai-diagnostic',
    key: 'IP',
    limit: 3,
    windowSeconds: 300,
  })
  testAi(@Body() body: TestAiAnalysisDto) {
    return this.skinAnalysis.testAiWithCloudinaryImage(body.secureUrl);
  }

  @Post('upload-intent')
  @UseGuards(AccessPermissionGuard, RateLimitGuard)
  @RequirePermission('SKIN_ANALYSIS_BASIC')
  @RateLimit({
    scope: 'skin-analysis-upload-intent',
    key: 'USER',
    limit: 10,
    windowSeconds: 60,
  })
  createUploadIntent(
    @CurrentUser() user: SecurityContext,
    @Body() body: CreateSkinAnalysisUploadIntentDto,
  ) {
    return this.skinAnalysis.createUploadIntent(
      user.userId,
      body.consentAccepted,
    );
  }

  @Post('analyze')
  @HttpCode(HttpStatus.ACCEPTED)
  @UseGuards(AccessPermissionGuard, RateLimitGuard)
  @RequirePermission('SKIN_ANALYSIS_BASIC')
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
  @UseGuards(AccessPermissionGuard)
  @RequirePermission('SKIN_ANALYSIS_BASIC')
  async history(
    @CurrentUser() user: SecurityContext,
    @Query() query: AnalysisHistoryQueryDto,
  ) {
    const canViewPremiumDetails =
      user.roles.includes('ADMIN') ||
      (await this.payment.hasPermission(user.userId, 'SKIN_ANALYSIS_DETAILS'));
    return this.skinAnalysis.listSessions(
      user.userId,
      query.page,
      query.limit,
      canViewPremiumDetails,
    );
  }

  @Get(':sessionId')
  @UseGuards(AccessPermissionGuard)
  @RequirePermission('SKIN_ANALYSIS_BASIC')
  async status(
    @CurrentUser() user: SecurityContext,
    @Param('sessionId') sessionId: string,
  ) {
    const canViewPremiumDetails =
      user.roles.includes('ADMIN') ||
      (await this.payment.hasPermission(user.userId, 'SKIN_ANALYSIS_DETAILS'));
    return this.skinAnalysis.getSession(
      user.userId,
      sessionId,
      canViewPremiumDetails,
    );
  }
}
