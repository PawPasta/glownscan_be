import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AuthModule } from '../auth/auth.module.js';
import { DatabaseModule } from '../../shared/database/database.module.js';
import { PaymentService } from './application/use-case/payment.service.js';
import { PaymentController } from './presentation/payment.controller.js';
import { NotificationModule } from '../notification/notification.module.js';
import { PAYMENT_DATA_PORT } from './application/ports/payment-data.port.js';
import { PostgresPaymentDataAdapter } from './infrastructure/adapters/postgres-payment-data.adapter.js';
import { PAYMENT_GATEWAY_PORT } from './application/ports/payment-gateway.port.js';
import { SePayVietQrGatewayAdapter } from './infrastructure/adapters/sepay-vietqr-gateway.adapter.js';
import { AdminGuard } from '../../shared/security/admin.guard.js';
import { AuditModule } from '../audit/audit.module.js';
import { AdminOperationsController } from './presentation/payment.controller.js';
import { AccessPermissionGuard } from '../../shared/security/access-permission.guard.js';
import { ACCESS_PERMISSION_PORT } from '../../shared/security/access-permission.port.js';

@Module({
  imports: [
    ConfigModule,
    DatabaseModule,
    AuthModule,
    NotificationModule,
    AuditModule,
  ],
  controllers: [PaymentController, AdminOperationsController],
  providers: [
    PaymentService,
    AdminGuard,
    AccessPermissionGuard,
    { provide: ACCESS_PERMISSION_PORT, useExisting: PaymentService },
    PostgresPaymentDataAdapter,
    { provide: PAYMENT_DATA_PORT, useExisting: PostgresPaymentDataAdapter },
    SePayVietQrGatewayAdapter,
    { provide: PAYMENT_GATEWAY_PORT, useExisting: SePayVietQrGatewayAdapter },
  ],
  exports: [PaymentService, AccessPermissionGuard, ACCESS_PERMISSION_PORT],
})
export class PaymentModule {}
