export const AUDIT_LOG_PORT = Symbol('AUDIT_LOG_PORT');

export interface AuditLogRecord {
  id: string;
  actorUserId: string;
  action: string;
  resourceType: string;
  resourceId: string;
  metadata: Record<string, unknown>;
  createdAt: Date;
}

export interface AuditLogPort {
  record(input: {
    actorUserId: string;
    action: string;
    resourceType: string;
    resourceId: string;
    metadata?: Record<string, unknown>;
  }): Promise<void>;
  list(
    page: number,
    limit: number,
  ): Promise<{
    items: AuditLogRecord[];
    page: number;
    limit: number;
    total: number;
  }>;
}
