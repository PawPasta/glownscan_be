import {
  Body,
  Controller,
  Get,
  Headers,
  Param,
  Patch,
  Post,
  Put,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../../shared/security/jwt-auth.guard.js';
import {
  CurrentUser,
  type SecurityContext,
} from '../../../shared/security/security.context.js';
import { RoutineService } from '../application/use-case/routine.service.js';
import {
  CheckInDto,
  CheckInHistoryQueryDto,
  CreateRoutineDraftDto,
  UpdateRoutineDto,
} from './routine.dto.js';

@ApiTags('routines')
@ApiBearerAuth('access-token')
@UseGuards(JwtAuthGuard)
@Controller('routines')
export class RoutineController {
  constructor(private readonly routines: RoutineService) {}
  @Post('draft') draft(
    @CurrentUser() user: SecurityContext,
    @Body() body: CreateRoutineDraftDto,
    @Headers('idempotency-key') idempotencyKey?: string,
  ) {
    return this.routines.createDraft({
      userId: user.userId,
      analysisSessionId: body.analysisSessionId ?? null,
      morning: body.preferences.morning,
      evening: body.preferences.evening,
      maxStepsPerRoutine: body.preferences.maxStepsPerRoutine,
      idempotencyKey: idempotencyKey ?? '',
    });
  }
  @Get('current') current(@CurrentUser() user: SecurityContext) {
    return this.routines.current(user.userId);
  }
  @Patch(':id') update(
    @CurrentUser() user: SecurityContext,
    @Param('id') id: string,
    @Body() body: UpdateRoutineDto,
  ) {
    return this.routines.update(user.userId, id, body);
  }
  @Post(':id/activate') activate(
    @CurrentUser() user: SecurityContext,
    @Param('id') id: string,
  ) {
    return this.routines.activate(user.userId, id);
  }
  @Post(':id/pause') pause(
    @CurrentUser() user: SecurityContext,
    @Param('id') id: string,
  ) {
    return this.routines.pause(user.userId, id);
  }
  @Post(':id/complete') complete(
    @CurrentUser() user: SecurityContext,
    @Param('id') id: string,
  ) {
    return this.routines.complete(user.userId, id);
  }
  @Get('current/today') today(@CurrentUser() user: SecurityContext) {
    return this.routines.today(
      user.userId,
      new Date().toISOString().slice(0, 10),
    );
  }
  @Put('current/check-ins/:date') checkIn(
    @CurrentUser() user: SecurityContext,
    @Param('date') date: string,
    @Body() body: CheckInDto,
  ) {
    return this.routines.checkIn(
      user.userId,
      date,
      body.completedStepIds,
      body.note ?? null,
    );
  }
  @Get('current/check-ins') history(
    @CurrentUser() user: SecurityContext,
    @Query() query: CheckInHistoryQueryDto,
  ) {
    return this.routines.history(user.userId, query.from, query.to);
  }
}
