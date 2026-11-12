import { Body, Controller, Get, Put, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import {
  CurrentUser,
  type SecurityContext,
} from '../../../shared/security/security.context.js';
import { JwtAuthGuard } from '../../../shared/security/jwt-auth.guard.js';
import { SkinAssessmentService } from '../application/use-case/skin-assessment.service.js';
import { SaveSkinAssessmentDto } from './skin-assessment.dto.js';

@ApiTags('skin-assessments')
@ApiBearerAuth('access-token')
@UseGuards(JwtAuthGuard)
@Controller('skin-assessments')
export class SkinAssessmentController {
  constructor(private readonly assessments: SkinAssessmentService) {}

  @Get('current')
  getCurrent(@CurrentUser() user: SecurityContext) {
    return this.assessments.getCurrent(user.userId);
  }

  @Put('current')
  saveCurrent(
    @CurrentUser() user: SecurityContext,
    @Body() body: SaveSkinAssessmentDto,
  ) {
    return this.assessments.saveCurrent(user.userId, body.answers);
  }
}
