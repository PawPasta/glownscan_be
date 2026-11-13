import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { PaymentModule } from '../payment/payment.module.js';
import { DatabaseModule } from '../../shared/database/database.module.js';
import { RoutineController } from './presentation/routine.controller.js';
import { RoutineService } from './application/use-case/routine.service.js';
import { ROUTINE_DATA_PORT } from './application/ports/routine-data.port.js';
import { PostgresRoutineDataAdapter } from './infrastructure/adapters/postgres-routine-data.adapter.js';
import { ROUTINE_FINGERPRINT_PORT } from './application/ports/routine-fingerprint.port.js';
import { Sha256RoutineFingerprintAdapter } from './infrastructure/adapters/sha256-routine-fingerprint.adapter.js';

@Module({
  imports: [AuthModule, DatabaseModule, PaymentModule],
  controllers: [RoutineController],
  providers: [
    RoutineService,
    PostgresRoutineDataAdapter,
    Sha256RoutineFingerprintAdapter,
    {
      provide: ROUTINE_FINGERPRINT_PORT,
      useExisting: Sha256RoutineFingerprintAdapter,
    },
    { provide: ROUTINE_DATA_PORT, useExisting: PostgresRoutineDataAdapter },
  ],
})
export class RoutineModule {}
