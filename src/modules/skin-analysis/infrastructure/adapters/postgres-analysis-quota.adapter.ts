import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DatabaseService } from '../../../../shared/database/database.service.js';
import type { Uuid } from '../../../../shared/types/domain.types.js';
import type {
  AnalysisQuotaPort,
  AnalysisReservation,
} from '../../application/ports/analysis-quota.port.js';

@Injectable()
export class PostgresAnalysisQuotaAdapter implements AnalysisQuotaPort {
  constructor(
    private readonly database: DatabaseService,
    private readonly config: ConfigService,
  ) {}

  async reserveAnalysis(userId: Uuid): Promise<AnalysisReservation | null> {
    const freeQuota = this.positiveInt(
      'GLOWNSCAN_ANALYSIS_DAILY_QUOTA_FREE',
      3,
    );
    const premiumQuota = this.positiveInt(
      'GLOWNSCAN_ANALYSIS_DAILY_QUOTA_PREMIUM',
      30,
    );
    const perUserConcurrency = this.positiveInt(
      'GLOWNSCAN_ANALYSIS_MAX_CONCURRENT_PER_USER',
      1,
    );
    const globalConcurrency = this.positiveInt(
      'GLOWNSCAN_ANALYSIS_MAX_CONCURRENT_GLOBAL',
      10,
    );
    const reservationTtlSeconds = this.positiveInt(
      'GLOWNSCAN_ANALYSIS_RESERVATION_TTL_SECONDS',
      180,
    );
    return this.database.transaction(async (client) => {
      await client.query(
        `SELECT pg_advisory_xact_lock(hashtextextended('glownscan:analysis:global', 0))`,
      );
      await client.query(
        `SELECT pg_advisory_xact_lock(hashtextextended($1, 0))`,
        [`glownscan:analysis:user:${userId}`],
      );
      await client.query(
        `UPDATE app_skin_analysis.analysis_usage_reservations
         SET status = 'EXPIRED', finalized_at = CURRENT_TIMESTAMP
         WHERE status = 'RESERVED' AND expires_at <= CURRENT_TIMESTAMP`,
      );
      const active = await client.query<{ count: string }>(
        `SELECT count(*) FROM app_skin_analysis.analysis_usage_reservations
         WHERE status = 'RESERVED' AND expires_at > CURRENT_TIMESTAMP`,
      );
      if (Number(active.rows[0].count) >= globalConcurrency) return null;
      const userActive = await client.query<{ count: string }>(
        `SELECT count(*) FROM app_skin_analysis.analysis_usage_reservations
         WHERE user_id = $1 AND status = 'RESERVED' AND expires_at > CURRENT_TIMESTAMP`,
        [userId],
      );
      if (Number(userActive.rows[0].count) >= perUserConcurrency) return null;
      const entitlement = await client.query<{
        plan: 'FREE' | 'PREMIUM';
        daily_quota: number | null;
      }>(
        `SELECT plan, daily_quota FROM app_skin_analysis.user_analysis_entitlements WHERE user_id = $1`,
        [userId],
      );
      const plan = entitlement.rows[0]?.plan ?? 'FREE';
      const quota =
        entitlement.rows[0]?.daily_quota ??
        (plan === 'PREMIUM' ? premiumQuota : freeQuota);
      const usage = await client.query<{ used_count: number }>(
        `INSERT INTO app_skin_analysis.daily_analysis_usage (user_id, usage_date, used_count)
         VALUES ($1, CURRENT_DATE, 0)
         ON CONFLICT (user_id, usage_date) DO UPDATE SET used_count = app_skin_analysis.daily_analysis_usage.used_count
         RETURNING used_count`,
        [userId],
      );
      if (usage.rows[0].used_count + Number(userActive.rows[0].count) >= quota)
        return null;
      const reservation = await client.query<{ id: Uuid }>(
        `INSERT INTO app_skin_analysis.analysis_usage_reservations (user_id, expires_at)
         VALUES ($1, CURRENT_TIMESTAMP + ($2 * INTERVAL '1 second')) RETURNING id`,
        [userId, reservationTtlSeconds],
      );
      return { id: reservation.rows[0].id };
    });
  }

  async finalizeAnalysis(reservationId: Uuid, charge: boolean): Promise<void> {
    await this.database.transaction(async (client) => {
      const reservation = await client.query<{ user_id: Uuid; status: string }>(
        `SELECT user_id, status FROM app_skin_analysis.analysis_usage_reservations WHERE id = $1 FOR UPDATE`,
        [reservationId],
      );
      if (
        reservation.rowCount !== 1 ||
        reservation.rows[0].status !== 'RESERVED'
      )
        return;
      await client.query(
        `UPDATE app_skin_analysis.analysis_usage_reservations
         SET status = $2, finalized_at = CURRENT_TIMESTAMP WHERE id = $1`,
        [reservationId, charge ? 'CHARGED' : 'RELEASED'],
      );
      if (charge) {
        await client.query(
          `UPDATE app_skin_analysis.daily_analysis_usage SET used_count = used_count + 1
           WHERE user_id = $1 AND usage_date = CURRENT_DATE`,
          [reservation.rows[0].user_id],
        );
      }
    });
  }

  private positiveInt(name: string, fallback: number): number {
    const value = Number(this.config.get<string>(name, String(fallback)));
    if (!Number.isInteger(value) || value < 1)
      throw new Error(`${name} must be a positive integer.`);
    return value;
  }
}
