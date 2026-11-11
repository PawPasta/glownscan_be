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
        reservation_id: Uuid;
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
           (o.payload->>'reservationId')::uuid AS reservation_id`,
        [limit],
      );
      return result.rows.map((row) => ({
        id: row.id,
        sessionId: row.session_id,
        userId: row.user_id,
        secureUrl: row.secure_url,
        reservationId: row.reservation_id,
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
      reservation_id: Uuid;
    }>(
      `SELECT o.id, o.session_id, o.payload->>'userId' AS user_id,
         o.payload->>'secureUrl' AS secure_url,
         (o.payload->>'reservationId')::uuid AS reservation_id
       FROM app_skin_analysis.analysis_outbox o
       WHERE o.id = $1 AND o.status = 'PUBLISHED'`,
      [outboxId],
    );
    const row = result.rows[0];
    return row
      ? {
          id: row.id,
          sessionId: row.session_id,
          userId: row.user_id,
          secureUrl: row.secure_url,
          reservationId: row.reservation_id,
        }
      : null;
  }
}
