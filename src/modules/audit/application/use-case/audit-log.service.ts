import { Inject, Injectable } from '@nestjs/common';
import { AUDIT_LOG_PORT, type AuditLogPort } from '../ports/audit-log.port.js';

@Injectable()
export class AuditLogService {
  constructor(
    @Inject(AUDIT_LOG_PORT) private readonly auditLog: AuditLogPort,
  ) {}

  record(input: Parameters<AuditLogPort['record']>[0]) {
    return this.auditLog.record(input);
  }

  list(page: number, limit: number) {
    return this.auditLog.list(page, limit);
  }
}
