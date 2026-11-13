import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DatabaseService } from '../../../../shared/database/database.service.js';
import type { Uuid } from '../../../../shared/types/domain.types.js';
import type {
  AnalysisSessionPort,
  PersistedAnalysisSession,
} from '../../application/ports/analysis-session.port.js';
import type { SkinAnalysisResult } from '../../application/types/skin-analysis-result.js';

@Injectable()
export class PostgresAnalysisSessionAdapter implements AnalysisSessionPort {
  constructor(
    private readonly database: DatabaseService,
    private readonly config: ConfigService,
  ) {}
  async claimSession(
    userId: Uuid,
    key: string,
    fingerprint: string,
  ): Promise<{ id: Uuid; created: boolean; fingerprint: string }> {
    return this.database.transaction(async (client) => {
      const inserted = await client.query<{
        id: Uuid;
        request_fingerprint: string;
      }>(
        `INSERT INTO app_skin_analysis.analysis_sessions (user_id, status, analysis_kind, idempotency_key, request_fingerprint, idempotency_expires_at)
         VALUES ($1, 'UPLOAD_PENDING', 'INITIAL', $2, $3, CURRENT_TIMESTAMP + INTERVAL '24 hours')
         ON CONFLICT (user_id, idempotency_key) DO NOTHING RETURNING id, request_fingerprint`,
        [userId, key, fingerprint],
      );
      if (inserted.rowCount === 1)
        return {
          id: inserted.rows[0].id,
          created: true,
          fingerprint: inserted.rows[0].request_fingerprint,
        };
      const existing = await client.query<{
        id: Uuid;
        request_fingerprint: string;
      }>(
        `SELECT id, request_fingerprint FROM app_skin_analysis.analysis_sessions WHERE user_id = $1 AND idempotency_key = $2 FOR UPDATE`,
        [userId, key],
      );
      return {
        id: existing.rows[0].id,
        created: false,
        fingerprint: existing.rows[0].request_fingerprint,
      };
    });
  }
  async markRunning(sessionId: Uuid, userId: Uuid): Promise<boolean> {
    const reclaimAfterSeconds = positiveInt(
      this.config,
      'GLOWNSCAN_ANALYSIS_WORKER_RECLAIM_AFTER_SECONDS',
      25,
    );
    const result = await this.database.query(
      `UPDATE app_skin_analysis.analysis_sessions SET status = 'RUNNING', started_at = CURRENT_TIMESTAMP, attempt_count = attempt_count + 1
       WHERE id = $1 AND user_id = $2
         AND (status = 'QUEUED' OR (status = 'RUNNING' AND started_at < CURRENT_TIMESTAMP - ($3 * INTERVAL '1 second')))`,
      [sessionId, userId, reclaimAfterSeconds],
    );
    return result.rowCount === 1;
  }
  async queueSession(
    sessionId: Uuid,
    userId: Uuid,
    payload: {
      secureUrl: string;
      publicId: string;
      consentVersion: string;
      reservationId: Uuid;
    },
  ): Promise<boolean> {
    return this.database.transaction(async (client) => {
      const queued = await client.query(
        `UPDATE app_skin_analysis.analysis_sessions
         SET status = 'QUEUED', next_attempt_at = CURRENT_TIMESTAMP
         WHERE id = $1 AND user_id = $2 AND status = 'UPLOAD_PENDING'`,
        [sessionId, userId],
      );
      if (queued.rowCount !== 1) return false;
      await client.query(
        `INSERT INTO app_skin_analysis.analysis_outbox (session_id, event_type, payload)
         VALUES ($1, 'PROCESS_ANALYSIS', $2::jsonb)`,
        [
          sessionId,
          JSON.stringify({
            userId,
            secureUrl: payload.secureUrl,
            publicId: payload.publicId,
            reservationId: payload.reservationId,
            providerCalled: false,
          }),
        ],
      );
      await client.query(
        `INSERT INTO app_skin_analysis.analysis_consents (user_id, session_id, purpose, consent_version)
         VALUES ($1, $2, 'SKIN_ANALYSIS', $3)`,
        [userId, sessionId, payload.consentVersion],
      );
      return true;
    });
  }
  async completeSession(
    sessionId: Uuid,
    userId: Uuid,
    analysis: SkinAnalysisResult,
    model: string,
  ): Promise<boolean> {
    return this.database.transaction(async (client) => {
      const updated = await client.query(
        `UPDATE app_skin_analysis.analysis_sessions
         SET status = 'SUCCEEDED', completed_at = CURRENT_TIMESTAMP, model_version = $3,
             prompt_version = 'skin-analysis-v1', result_schema_version = $4
         WHERE id = $1 AND user_id = $2 AND status = 'RUNNING'`,
        [sessionId, userId, model, analysis.schemaVersion],
      );
      if (updated.rowCount !== 1) return false;
      await client.query(
        `INSERT INTO app_skin_analysis.analysis_results (session_id, quality_accepted, quality_issues, limitations, provider_payload)
         VALUES ($1, $2, $3::jsonb, $4::jsonb, $5::jsonb)`,
        [
          sessionId,
          analysis.quality.accepted,
          JSON.stringify(analysis.quality.issues),
          JSON.stringify(analysis.limitations),
          JSON.stringify(analysis),
        ],
      );
      for (const [
        displayOrder,
        observation,
      ] of analysis.observations.entries()) {
        await client.query(
          `INSERT INTO app_skin_analysis.analysis_observations
             (session_id, observation_type, severity, confidence, visibility, note, box_2d, display_order)
           VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, $8)`,
          [
            sessionId,
            observation.type,
            observation.severity,
            observation.confidence,
            observation.visibility,
            observation.note,
            JSON.stringify(observation.box2d),
            displayOrder,
          ],
        );
      }
      return true;
    });
  }

  async retrySession(sessionId: Uuid, userId: Uuid) {
    await this.database.query(
      `UPDATE app_skin_analysis.analysis_sessions
       SET status = 'QUEUED', started_at = NULL, error_code = NULL, error_message = NULL
       WHERE id = $1 AND user_id = $2 AND status = 'RUNNING'`,
      [sessionId, userId],
    );
  }
  async failSession(
    sessionId: Uuid,
    userId: Uuid,
    errorCode: string,
  ): Promise<void> {
    await this.database.query(
      `UPDATE app_skin_analysis.analysis_sessions SET status = 'FAILED', completed_at = CURRENT_TIMESTAMP, error_code = $3, error_message = NULL
       WHERE id = $1 AND user_id = $2 AND status IN ('UPLOAD_PENDING', 'QUEUED', 'RUNNING')`,
      [sessionId, userId, errorCode],
    );
  }

  async failSessionAndPurgeData(
    sessionId: Uuid,
    userId: Uuid,
    errorCode: string,
  ): Promise<void> {
    await this.database.transaction(async (client) => {
      const updated = await client.query(
        `UPDATE app_skin_analysis.analysis_sessions
         SET status = 'FAILED', completed_at = CURRENT_TIMESTAMP,
             error_code = $3, error_message = NULL, model_version = NULL,
             prompt_version = NULL, result_schema_version = NULL
         WHERE id = $1 AND user_id = $2 AND status IN ('QUEUED', 'RUNNING')`,
        [sessionId, userId, errorCode],
      );
      if (updated.rowCount !== 1) return;
      for (const table of [
        'analysis_results',
        'analysis_observations',
        'assessment_snapshots',
        'analysis_consents',
        'analysis_images',
      ]) {
        await client.query(
          `DELETE FROM app_skin_analysis.${table} WHERE session_id = $1`,
          [sessionId],
        );
      }
      await client.query(
        `UPDATE app_skin_analysis.analysis_outbox
         SET status = 'FAILED', payload = '{}'::jsonb, locked_at = NULL,
             processed_at = CURRENT_TIMESTAMP
         WHERE session_id = $1`,
        [sessionId],
      );
    });
  }
  async findSession(
    userId: Uuid,
    sessionId: Uuid,
  ): Promise<PersistedAnalysisSession | null> {
    const result = await this.database.query<PersistedAnalysisSession>(
      this.selectSql() + ' WHERE s.user_id = $1 AND s.id = $2',
      [userId, sessionId],
    );
    return result.rows[0] ?? null;
  }
  async listSessions(
    userId: Uuid,
    limit: number,
    offset: number,
  ): Promise<{ items: PersistedAnalysisSession[]; total: number }> {
    const [items, count] = await Promise.all([
      this.database.query<PersistedAnalysisSession>(
        this.selectSql() +
          ' WHERE s.user_id = $1 ORDER BY s.created_at DESC LIMIT $2 OFFSET $3',
        [userId, limit, offset],
      ),
      this.database.query<{ total: string }>(
        'SELECT count(*) AS total FROM app_skin_analysis.analysis_sessions WHERE user_id = $1',
        [userId],
      ),
    ]);
    return { items: items.rows, total: Number(count.rows[0].total) };
  }
  private selectSql(): string {
    return `SELECT s.id, s.status, s.created_at AS "createdAt", s.completed_at AS "completedAt", s.error_code AS "errorCode", r.provider_payload AS result
      FROM app_skin_analysis.analysis_sessions s LEFT JOIN app_skin_analysis.analysis_results r ON r.session_id = s.id`;
  }
}

function positiveInt(
  config: ConfigService,
  name: string,
  fallback: number,
): number {
  const value = Number(config.get<string>(name, String(fallback)));
  if (!Number.isInteger(value) || value < 1)
    throw new Error(`${name} must be a positive integer.`);
  return value;
}
