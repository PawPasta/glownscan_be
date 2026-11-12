import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../../shared/security/jwt-auth.guard.js';
import {
  CurrentUser,
  type SecurityContext,
} from '../../../shared/security/security.context.js';
import { NotificationService } from '../application/use-case/notification.service.js';
import {
  NotificationListQueryDto,
  NotificationPreferencesDto,
} from './notification.dto.js';

@ApiTags('notifications')
@ApiBearerAuth('access-token')
@UseGuards(JwtAuthGuard)
@Controller()
export class NotificationController {
  constructor(private readonly notifications: NotificationService) {}
  @Get('notification-preferences') preferences(
    @CurrentUser() user: SecurityContext,
  ) {
    return this.notifications.getPreferences(user.userId);
  }
  @Patch('notification-preferences') updatePreferences(
    @CurrentUser() user: SecurityContext,
    @Body() body: NotificationPreferencesDto,
  ) {
    return this.notifications.updatePreferences(user.userId, body);
  }
  @Get('notifications') list(
    @CurrentUser() user: SecurityContext,
    @Query() query: NotificationListQueryDto,
  ) {
    return this.notifications.list(user.userId, query.page, query.limit);
  }
  @Patch('notifications/:id/read') markRead(
    @CurrentUser() user: SecurityContext,
    @Param('id') id: string,
  ) {
    return this.notifications.markRead(user.userId, id);
  }
  @Post('notifications/read-all') markAll(
    @CurrentUser() user: SecurityContext,
  ) {
    return this.notifications.markAllRead(user.userId);
  }
}
