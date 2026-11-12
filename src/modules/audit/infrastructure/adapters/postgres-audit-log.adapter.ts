import { Injectable } from '@nestjs/common';
import { DatabaseService } from '../../../../shared/database/database.service.js';
import type {
  AuditLogPort,
  AuditLogRecord,
} from '../../application/ports/audit-log.port.js';

@Injectable()
export class PostgresAuditLogAdapter implements AuditLogPort {
  constructor(private readonly database: DatabaseService) {}

  async record(input: Parameters<AuditLogPort['record']>[0]): Promise<void> {
    await this.database.query(
      `INSERT INTO app_billing.admin_audit_logs
         (actor_user_id, action, resource_type, resource_id, metadata)
       VALUES ($1, $2, $3, $4, $5::jsonb)`,
      [
        input.actorUserId,
        input.action,
        input.resourceType,
        input.resourceId,
        JSON.stringify(input.metadata ?? {}),
      ],
    );
  }

  async list(page: number, limit: number) {
    const result = await this.database.query<
      AuditLogRecord & { total: string }
    >(
      `SELECT id, actor_user_id AS "actorUserId", action,
              resource_type AS "resourceType", resource_id AS "resourceId",
              metadata, created_at AS "createdAt", COUNT(*) OVER() AS total
       FROM app_billing.admin_audit_logs
       ORDER BY created_at DESC LIMIT $1 OFFSET $2`,
      [limit, (page - 1) * limit],
    );
    return {
      items: result.rows.map(({ total: _total, ...row }) => row),
      page,
      limit,
      total: Number(result.rows[0]?.total ?? 0),
    };
  }
}
