import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { DatabaseModule } from '../../shared/database/database.module.js';
import { NotificationService } from './application/use-case/notification.service.js';
import { NOTIFICATION_DELIVERY_PORT } from './application/ports/notification-delivery.port.js';
import { NotificationDispatchAdapter } from './infrastructure/adapters/notification-dispatch.adapter.js';

@Module({
  imports: [ConfigModule, DatabaseModule],
  providers: [
    NotificationService,
    NotificationDispatchAdapter,
    {
      provide: NOTIFICATION_DELIVERY_PORT,
      useExisting: NotificationDispatchAdapter,
    },
  ],
  exports: [NotificationService],
})
export class NotificationModule {}
