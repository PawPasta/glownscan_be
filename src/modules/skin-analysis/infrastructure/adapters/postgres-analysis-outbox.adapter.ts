import { Injectable } from '@nestjs/common';
import { DatabaseService } from '../../../../shared/database/database.service.js';
import type { Uuid } from '../../../../shared/types/domain.types.js';
import type {
  AnalysisOutboxMessage,
  AnalysisOutboxPort,
} from '../../application/ports/analysis-outbox.port.js';

@Injectable()
export class PostgresAnalysisOutboxAdapter implements AnalysisOutboxPort {
  constructor(private readonly database: DatabaseService) {}

  async claimAvailable(limit: number): Promise<AnalysisOutboxMessage[]> {
    return this.database.transaction(async (client) => {
      await client.query(
        `UPDATE app_skin_analysis.analysis_outbox
         SET status = 'PENDING', locked_at = NULL
         WHERE status = 'PROCESSING'
           AND locked_at < CURRENT_TIMESTAMP - INTERVAL '5 minutes'`,
      );
      const result = await client.query<{
        id: Uuid;
        session_id: Uuid;
        user_id: Uuid;
        secure_url: string;
        public_id: string;
        reservation_id: Uuid;
        provider_called: boolean;
        cleanup_error_code: string | null;
      }>(
        `WITH candidates AS (
           SELECT o.id
           FROM app_skin_analysis.analysis_outbox o
           WHERE o.status = 'PENDING' AND o.available_at <= CURRENT_TIMESTAMP
           ORDER BY o.created_at
           FOR UPDATE SKIP LOCKED
           LIMIT $1
         )
         UPDATE app_skin_analysis.analysis_outbox o
         SET status = 'PROCESSING', locked_at = CURRENT_TIMESTAMP,
             attempt_count = attempt_count + 1
         FROM candidates c
         WHERE o.id = c.id
         RETURNING o.id, o.session_id,
           o.payload->>'userId' AS user_id,
           o.payload->>'secureUrl' AS secure_url,
           o.payload->>'publicId' AS public_id,
           (o.payload->>'reservationId')::uuid AS reservation_id,
           COALESCE((o.payload->>'providerCalled')::boolean, false) AS provider_called,
           o.payload->>'cleanupErrorCode' AS cleanup_error_code`,
        [limit],
      );
      return result.rows.map((row) => ({
        id: row.id,
        sessionId: row.session_id,
        userId: row.user_id,
        secureUrl: row.secure_url,
        publicId: row.public_id,
        reservationId: row.reservation_id,
        providerCalled: row.provider_called,
        cleanupErrorCode: row.cleanup_error_code,
      }));
    });
  }

  async markPublished(outboxId: Uuid): Promise<void> {
    await this.database.query(
      `UPDATE app_skin_analysis.analysis_outbox
       SET status = 'PUBLISHED', processed_at = CURRENT_TIMESTAMP, locked_at = NULL
       WHERE id = $1 AND status = 'PROCESSING'`,
      [outboxId],
    );
  }

  async release(outboxId: Uuid): Promise<void> {
    await this.database.query(
      `UPDATE app_skin_analysis.analysis_outbox
       SET status = 'PENDING', locked_at = NULL,
           available_at = CURRENT_TIMESTAMP + INTERVAL '5 seconds'
       WHERE id = $1 AND status = 'PROCESSING'`,
      [outboxId],
    );
  }

  async findPublished(outboxId: Uuid): Promise<AnalysisOutboxMessage | null> {
    const result = await this.database.query<{
      id: Uuid;
      session_id: Uuid;
      user_id: Uuid;
      secure_url: string;
      public_id: string;
      reservation_id: Uuid;
      provider_called: boolean;
      cleanup_error_code: string | null;
    }>(
      `SELECT o.id, o.session_id, o.payload->>'userId' AS user_id,
         o.payload->>'secureUrl' AS secure_url,
         (o.payload->>'reservationId')::uuid AS reservation_id,
         o.payload->>'publicId' AS public_id,
         COALESCE((o.payload->>'providerCalled')::boolean, false) AS provider_called,
         o.payload->>'cleanupErrorCode' AS cleanup_error_code
       FROM app_skin_analysis.analysis_outbox o
       WHERE o.id = $1 AND o.status IN ('PROCESSING', 'PUBLISHED')`,
      [outboxId],
    );
    const row = result.rows[0];
    return row
      ? {
          id: row.id,
          sessionId: row.session_id,
          userId: row.user_id,
          secureUrl: row.secure_url,
          publicId: row.public_id,
          reservationId: row.reservation_id,
          providerCalled: row.provider_called,
          cleanupErrorCode: row.cleanup_error_code,
        }
      : null;
  }

  async markProviderCalled(outboxId: Uuid): Promise<void> {
    await this.database.query(
      `UPDATE app_skin_analysis.analysis_outbox
       SET payload = jsonb_set(payload, '{providerCalled}', 'true'::jsonb, true)
       WHERE id = $1 AND status IN ('PROCESSING', 'PUBLISHED')`,
      [outboxId],
    );
  }

  async markCleanupRequired(outboxId: Uuid, errorCode: string): Promise<void> {
    await this.database.query(
      `UPDATE app_skin_analysis.analysis_outbox
       SET payload = jsonb_set(payload, '{cleanupErrorCode}', to_jsonb($2::text), true)
       WHERE id = $1 AND status = 'PUBLISHED'`,
      [outboxId, errorCode],
    );
  }
}
