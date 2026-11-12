import { Module } from '@nestjs/common';
import { DatabaseModule } from '../../shared/database/database.module.js';
import { AUDIT_LOG_PORT } from './application/ports/audit-log.port.js';
import { AuditLogService } from './application/use-case/audit-log.service.js';
import { PostgresAuditLogAdapter } from './infrastructure/adapters/postgres-audit-log.adapter.js';

@Module({
  imports: [DatabaseModule],
  providers: [
    AuditLogService,
    PostgresAuditLogAdapter,
    { provide: AUDIT_LOG_PORT, useExisting: PostgresAuditLogAdapter },
  ],
  exports: [AuditLogService],
})
export class AuditModule {}
