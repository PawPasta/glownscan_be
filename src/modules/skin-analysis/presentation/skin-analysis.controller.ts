import { Body, Controller, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import {
  CurrentUser,
  type SecurityContext,
} from '../../../shared/security/security.context.js';
import { JwtAuthGuard } from '../../../shared/security/jwt-auth.guard.js';
import { SkinAnalysisService } from '../application/use-case/skin-analysis.service.js';
import { ConfirmSkinAnalysisUploadDto } from './skin-analysis.dto.js';

@ApiTags('skin-analysis')
@ApiBearerAuth('access-token')
@UseGuards(JwtAuthGuard)
@Controller('skin-analysis')
export class SkinAnalysisController {
  constructor(private readonly skinAnalysis: SkinAnalysisService) {}

  @Post('upload-intent')
  createUploadIntent(@CurrentUser() user: SecurityContext) {
    return this.skinAnalysis.createUploadIntent(user.userId);
  }

  @Post('analyze')
  analyze(
    @CurrentUser() user: SecurityContext,
    @Body() body: ConfirmSkinAnalysisUploadDto,
  ) {
    return this.skinAnalysis.analyzeCloudinaryImage(user.userId, body);
  }
}
