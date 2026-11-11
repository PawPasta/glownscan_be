import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { DatabaseModule } from '../../shared/database/database.module.js';
import { NotificationService } from './application/notification.service.js';

@Module({
  imports: [ConfigModule, DatabaseModule],
  providers: [NotificationService],
  exports: [NotificationService],
})
export class NotificationModule {}
