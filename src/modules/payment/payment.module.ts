import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AuthModule } from '../auth/auth.module.js';
import { DatabaseModule } from '../../shared/database/database.module.js';
import { PaymentService } from './application/use-case/payment.service.js';
import { PaymentController } from './presentation/payment.controller.js';
import { NotificationModule } from '../notification/notification.module.js';

@Module({
  imports: [ConfigModule, DatabaseModule, AuthModule, NotificationModule],
  controllers: [PaymentController],
  providers: [PaymentService],
})
export class PaymentModule {}
