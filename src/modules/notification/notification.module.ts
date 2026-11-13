import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { DatabaseModule } from '../../shared/database/database.module.js';
import { AuthModule } from '../auth/auth.module.js';
import { NotificationService } from './application/use-case/notification.service.js';
import { NOTIFICATION_DELIVERY_PORT } from './application/ports/notification-delivery.port.js';
import { NotificationDispatchAdapter } from './infrastructure/adapters/notification-dispatch.adapter.js';
import { NotificationController } from './presentation/notification.controller.js';
import { NOTIFICATION_DATA_PORT } from './application/ports/notification-data.port.js';
import { PostgresNotificationDataAdapter } from './infrastructure/adapters/postgres-notification-data.adapter.js';
import { ANALYSIS_FAILURE_NOTIFICATION_PORT } from './application/ports/analysis-failure-notification.port.js';

@Module({
  imports: [ConfigModule, DatabaseModule, AuthModule],
  controllers: [NotificationController],
  providers: [
    NotificationService,
    NotificationDispatchAdapter,
    PostgresNotificationDataAdapter,
    {
      provide: NOTIFICATION_DATA_PORT,
      useExisting: PostgresNotificationDataAdapter,
    },
    {
      provide: NOTIFICATION_DELIVERY_PORT,
      useExisting: NotificationDispatchAdapter,
    },
    {
      provide: ANALYSIS_FAILURE_NOTIFICATION_PORT,
      useExisting: NotificationService,
    },
  ],
  exports: [NotificationService, ANALYSIS_FAILURE_NOTIFICATION_PORT],
})
export class NotificationModule {}
