import type { AuthAuditLog } from '../../domain/entities/auth-audit-log.entity.js';
import type { Uuid } from '../../domain/entities/auth.types.js';
import type { AuthEventResult } from '../../domain/entities/enums/auth.enums.js';
import type { Page, PageRequest } from '../../../../shared/ports/repository.port.js';

export interface AuthAuditLogFilter {
  userId?: Uuid;
  deviceId?: Uuid;
  eventType?: string;
  result?: AuthEventResult;
  from?: Date;
  to?: Date;
}

export interface AuthAuditLogRepositoryPort {
  append(event: AuthAuditLog): Promise<AuthAuditLog>;
  findAll(
    filter: AuthAuditLogFilter,
    page: PageRequest,
  ): Promise<Page<AuthAuditLog>>;
  findByUserId(userId: Uuid, page: PageRequest): Promise<Page<AuthAuditLog>>;
}
