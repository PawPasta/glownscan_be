import { Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { DatabaseService } from '../../../../shared/database/database.service.js';
import type {
  Routine,
  RoutineStatus,
  RoutineStep,
} from '../../domain/routine.types.js';
import type {
  RoutineDataPort,
  PersistRoutineDraftInput,
} from '../../application/ports/routine-data.port.js';

@Injectable()
export class PostgresRoutineDataAdapter implements RoutineDataPort {
  constructor(private readonly database: DatabaseService) {}

  async createDraft(input: PersistRoutineDraftInput): Promise<Routine> {
    return this.database.transaction(async (client) => {
      const analysis = input.analysisSessionId
        ? await client.query<{ id: string }>(
            `SELECT s.id FROM app_skin_analysis.analysis_sessions s JOIN app_skin_analysis.analysis_results r ON r.session_id = s.id AND r.quality_accepted = TRUE WHERE s.id = $1 AND s.user_id = $2 AND s.status = 'SUCCEEDED'`,
            [input.analysisSessionId, input.userId],
          )
        : await client.query<{ id: string }>(
            `SELECT s.id FROM app_skin_analysis.analysis_sessions s JOIN app_skin_analysis.analysis_results r ON r.session_id = s.id AND r.quality_accepted = TRUE WHERE s.user_id = $1 AND s.status = 'SUCCEEDED' ORDER BY s.completed_at DESC LIMIT 1`,
            [input.userId],
          );
      if (input.analysisSessionId && !analysis.rowCount)
        throw new Error('ROUTINE_ANALYSIS_NOT_AVAILABLE');
      const sourceAnalysisSessionId = analysis.rows[0]?.id ?? null;
      const claim = await client.query<{ id: string }>(
        `INSERT INTO app_routines.routines (user_id, title, status, idempotency_key, request_fingerprint)
         VALUES ($1, 'Personalized skin routine', 'DRAFT', $2, $3)
         ON CONFLICT (user_id, idempotency_key) DO NOTHING RETURNING id`,
        [input.userId, input.idempotencyKey, input.requestFingerprint],
      );
      if (!claim.rowCount) {
        const existing = await client.query<Record<string, unknown>>(
          `SELECT id, title, status, morning_steps AS "morningSteps", evening_steps AS "eveningSteps", created_at AS "createdAt", updated_at AS "updatedAt", activated_at AS "activatedAt", completed_at AS "completedAt", request_fingerprint AS "requestFingerprint"
           FROM app_routines.routines WHERE user_id = $1 AND idempotency_key = $2 FOR UPDATE`,
          [input.userId, input.idempotencyKey],
        );
        const row = existing.rows[0];
        if (!row || row.requestFingerprint !== input.requestFingerprint)
          throw new Error('ROUTINE_IDEMPOTENCY_CONFLICT');
        return this.mapRoutine(row);
      }

      const products = await client.query<{
        id: string;
        name: string;
        brand: string | null;
        image_url: string | null;
      }>(
        `SELECT DISTINCT p.id, p.name, p.brand, p.image_url
         FROM app_catalog.products p
         LEFT JOIN app_catalog.product_skin_concerns pc ON pc.product_id = p.id
         LEFT JOIN app_catalog.skin_concerns c ON c.id = pc.skin_concern_id AND c.is_active
         LEFT JOIN app_skin_analysis.user_assessments sa ON sa.user_id = $1
         LEFT JOIN app_skin_analysis.analysis_results ar ON ar.session_id = $3
         WHERE p.is_active AND ((sa.answers -> 'concerns') ? c.code
           OR (c.code = 'ACNE' AND ar.provider_payload #>> '{metrics,acne,visibility}' = 'CLEAR' AND (ar.provider_payload #>> '{metrics,acne,score}')::int >= 50)
           OR (c.code = 'REDNESS' AND ar.provider_payload #>> '{metrics,redness,visibility}' = 'CLEAR' AND (ar.provider_payload #>> '{metrics,redness,score}')::int >= 50)
           OR (c.code = 'DARK_SPOTS' AND ar.provider_payload #>> '{metrics,darkSpots,visibility}' = 'CLEAR' AND (ar.provider_payload #>> '{metrics,darkSpots,score}')::int >= 50)
           OR (c.code = 'PORES' AND ar.provider_payload #>> '{metrics,pores,visibility}' = 'CLEAR' AND (ar.provider_payload #>> '{metrics,pores,score}')::int >= 50)
           OR (c.code = 'DRYNESS' AND ar.provider_payload #>> '{metrics,dryness,visibility}' = 'CLEAR' AND (ar.provider_payload #>> '{metrics,dryness,score}')::int >= 50)
           OR (c.code = 'OILINESS' AND ar.provider_payload #>> '{metrics,oiliness,visibility}' = 'CLEAR' AND (ar.provider_payload #>> '{metrics,oiliness,score}')::int >= 50)
           OR (c.code = 'TEXTURE' AND ar.provider_payload #>> '{metrics,unevenTexture,visibility}' = 'CLEAR' AND (ar.provider_payload #>> '{metrics,unevenTexture,score}')::int >= 50)
           OR pc.product_id IS NULL)
         ORDER BY p.name LIMIT $2`,
        [input.userId, input.maxStepsPerRoutine, sourceAnalysisSessionId],
      );
      const makeSteps = (period: 'MORNING' | 'EVENING'): RoutineStep[] => {
        const base =
          period === 'MORNING'
            ? [
                {
                  title: 'Cleanse',
                  instruction: 'Gently cleanse your face and pat dry.',
                  optional: false,
                },
                {
                  title: 'Moisturize',
                  instruction: 'Apply moisturizer suitable for your skin.',
                  optional: false,
                },
                {
                  title: 'Sun protection',
                  instruction: 'Apply broad-spectrum sunscreen as directed.',
                  optional: false,
                },
              ]
            : [
                {
                  title: 'Cleanse',
                  instruction: 'Remove sunscreen and cleanse gently.',
                  optional: false,
                },
                {
                  title: 'Targeted care',
                  instruction:
                    'Apply one suitable product according to its label.',
                  optional: true,
                },
                {
                  title: 'Moisturize',
                  instruction: 'Apply moisturizer to support the skin barrier.',
                  optional: false,
                },
              ];
        return base.slice(0, input.maxStepsPerRoutine).map((step, index) => ({
          id: randomUUID(),
          period,
          position: index + 1,
          ...step,
          product:
            step.title === 'Targeted care' && products.rows[0]
              ? {
                  id: products.rows[0].id,
                  name: products.rows[0].name,
                  brand: products.rows[0].brand,
                  imageUrl: products.rows[0].image_url,
                }
              : null,
        }));
      };
      const morningSteps = input.morning ? makeSteps('MORNING') : [];
      const eveningSteps = input.evening ? makeSteps('EVENING') : [];
      await client.query(
        `UPDATE app_routines.routines SET morning_steps = $2::jsonb, evening_steps = $3::jsonb, source_analysis_session_id = $4, updated_at = CURRENT_TIMESTAMP WHERE id = $1`,
        [
          claim.rows[0].id,
          JSON.stringify(morningSteps),
          JSON.stringify(eveningSteps),
          sourceAnalysisSessionId,
        ],
      );
      const now = new Date().toISOString();
      return {
        id: claim.rows[0].id,
        title: 'Personalized skin routine',
        status: 'DRAFT',
        morningSteps,
        eveningSteps,
        createdAt: now,
        updatedAt: now,
        activatedAt: null,
        completedAt: null,
      };
    });
  }

  getCurrent(userId: string) {
    return this.readRoutine(
      "user_id = $1 AND status IN ('DRAFT', 'ACTIVE', 'PAUSED')",
      [userId],
    );
  }
  getOwned(userId: string, routineId: string) {
    return this.readRoutine('user_id = $1 AND id = $2', [userId, routineId]);
  }

  async updateDraft(
    userId: string,
    routineId: string,
    input: {
      title?: string;
      morningSteps?: unknown[];
      eveningSteps?: unknown[];
    },
  ) {
    return this.database.transaction(async (client) => {
      const withIds = async (steps?: unknown[]) => {
        if (steps === undefined) return null;
        const mapped: Array<Record<string, unknown>> = steps.map((step) => {
          const value = step as Record<string, unknown>;
          return {
            ...value,
            id: typeof value.id === 'string' ? value.id : randomUUID(),
          };
        });
        const productIds = mapped.flatMap((step) =>
          step.product &&
          typeof step.product === 'object' &&
          'id' in step.product
            ? [String(step.product.id)]
            : [],
        );
        if (!productIds.length) return mapped;
        const products = await client.query<{
          id: string;
          name: string;
          brand: string | null;
          image_url: string | null;
        }>(
          `SELECT id, name, brand, image_url FROM app_catalog.products WHERE id = ANY($1::uuid[]) AND is_active`,
          [productIds],
        );
        const productMap = new Map(
          products.rows.map((product) => [product.id, product]),
        );
        return mapped.map((step) => {
          if (
            !step.product ||
            typeof step.product !== 'object' ||
            !('id' in step.product)
          )
            return step;
          const product = productMap.get(String(step.product.id));
          if (!product) throw new Error('ROUTINE_PRODUCT_NOT_FOUND');
          return {
            ...step,
            product: {
              id: product.id,
              name: product.name,
              brand: product.brand,
              imageUrl: product.image_url,
            },
          };
        });
      };
      const morningSteps = await withIds(input.morningSteps);
      const eveningSteps = await withIds(input.eveningSteps);
      const result = await client.query(
        `UPDATE app_routines.routines SET title = COALESCE($3, title), morning_steps = COALESCE($4::jsonb, morning_steps), evening_steps = COALESCE($5::jsonb, evening_steps), updated_at = CURRENT_TIMESTAMP
       WHERE user_id = $1 AND id = $2 AND status IN ('DRAFT', 'ACTIVE', 'PAUSED') RETURNING id`,
        [
          userId,
          routineId,
          input.title ?? null,
          morningSteps === null ? null : JSON.stringify(morningSteps),
          eveningSteps === null ? null : JSON.stringify(eveningSteps),
        ],
      );
      if (!result.rows[0]) return null;
      const updated = await client.query<Record<string, unknown>>(
        `SELECT id, title, status, morning_steps AS "morningSteps", evening_steps AS "eveningSteps", created_at AS "createdAt", updated_at AS "updatedAt", activated_at AS "activatedAt", completed_at AS "completedAt" FROM app_routines.routines WHERE user_id = $1 AND id = $2`,
        [userId, routineId],
      );
      return updated.rows[0] ? this.mapRoutine(updated.rows[0]) : null;
    });
  }

  async transition(
    userId: string,
    routineId: string,
    from: RoutineStatus[],
    to: RoutineStatus,
  ) {
    const result = await this.database.query(
      `UPDATE app_routines.routines SET status = $3, updated_at = CURRENT_TIMESTAMP,
       activated_at = CASE WHEN $3 = 'ACTIVE' THEN COALESCE(activated_at, CURRENT_TIMESTAMP) ELSE activated_at END,
       completed_at = CASE WHEN $3 = 'COMPLETED' THEN CURRENT_TIMESTAMP ELSE completed_at END
       WHERE user_id = $1 AND id = $2 AND status = ANY($4::varchar[]) RETURNING id`,
      [userId, routineId, to, from],
    );
    return result.rows[0] ? this.getOwned(userId, routineId) : null;
  }

  async upsertCheckIn(
    userId: string,
    date: string,
    completedStepIds: string[],
    note: string | null,
  ) {
    const routine = await this.getCurrent(userId);
    if (!routine) throw new Error('ACTIVE_ROUTINE_NOT_FOUND');
    const total = routine.morningSteps.length + routine.eveningSteps.length;
    const saved = await this.database.query<{
      date: string;
      completedStepIds: string[];
    }>(
      `INSERT INTO app_routines.daily_check_ins (routine_id, check_in_date, completed_step_ids, note)
       VALUES ($1, $2::date, $3::jsonb, $4)
       ON CONFLICT (routine_id, check_in_date) DO UPDATE SET completed_step_ids = EXCLUDED.completed_step_ids, note = EXCLUDED.note, updated_at = CURRENT_TIMESTAMP
       RETURNING check_in_date::text AS date, completed_step_ids AS "completedStepIds"`,
      [routine.id, date, JSON.stringify(completedStepIds), note],
    );
    return {
      ...saved.rows[0],
      completionPercent: total
        ? Math.round((completedStepIds.length * 100) / total)
        : 0,
      streakDays: await this.streakDays(routine.id, date),
    };
  }

  async getCheckIn(userId: string, date: string) {
    const routine = await this.getCurrent(userId);
    if (!routine) return null;
    const result = await this.database.query<{
      date: string;
      completedStepIds: string[];
    }>(
      `SELECT check_in_date::text AS date, completed_step_ids AS "completedStepIds" FROM app_routines.daily_check_ins WHERE routine_id = $1 AND check_in_date = $2::date`,
      [routine.id, date],
    );
    const row = result.rows[0];
    if (!row) return null;
    const total = routine.morningSteps.length + routine.eveningSteps.length;
    return {
      ...row,
      completionPercent: total
        ? Math.round(((row.completedStepIds as string[]).length * 100) / total)
        : 0,
      streakDays: await this.streakDays(routine.id, date),
    };
  }

  private async streakDays(routineId: string, date: string): Promise<number> {
    const result = await this.database.query<{ check_in_date: string }>(
      `SELECT check_in_date::text FROM app_routines.daily_check_ins WHERE routine_id = $1 AND check_in_date <= $2::date ORDER BY check_in_date DESC LIMIT 366`,
      [routineId, date],
    );
    let streak = 0;
    let expected = new Date(`${date}T00:00:00.000Z`);
    for (const row of result.rows) {
      if (row.check_in_date !== expected.toISOString().slice(0, 10)) break;
      streak += 1;
      expected = new Date(expected.getTime() - 86_400_000);
    }
    return streak;
  }

  async listCheckIns(userId: string, from: string, to: string) {
    const routine = await this.getCurrent(userId);
    if (!routine) return [];
    const result = await this.database.query<{
      date: string;
      completedStepIds: string[];
    }>(
      `SELECT check_in_date::text AS date, completed_step_ids AS "completedStepIds" FROM app_routines.daily_check_ins WHERE routine_id = $1 AND check_in_date BETWEEN $2::date AND $3::date ORDER BY check_in_date`,
      [routine.id, from, to],
    );
    const total = routine.morningSteps.length + routine.eveningSteps.length;
    return result.rows.map((row) => ({
      ...row,
      completionPercent: total
        ? Math.round(((row.completedStepIds as string[]).length * 100) / total)
        : 0,
    }));
  }

  private async readRoutine(
    where: string,
    values: unknown[],
  ): Promise<Routine | null> {
    const result = await this.database.query<Record<string, unknown>>(
      `SELECT id, title, status, morning_steps AS "morningSteps", evening_steps AS "eveningSteps", created_at AS "createdAt", updated_at AS "updatedAt", activated_at AS "activatedAt", completed_at AS "completedAt" FROM app_routines.routines WHERE ${where} ORDER BY created_at DESC LIMIT 1`,
      values,
    );
    const row = result.rows[0];
    if (!row) return null;
    return this.mapRoutine(row);
  }

  private mapRoutine(row: Record<string, unknown>): Routine {
    const { requestFingerprint: _requestFingerprint, ...routine } = row;
    return {
      ...routine,
      createdAt: new Date(routine.createdAt as Date).toISOString(),
      updatedAt: new Date(routine.updatedAt as Date).toISOString(),
      activatedAt: routine.activatedAt
        ? new Date(routine.activatedAt as Date).toISOString()
        : null,
      completedAt: routine.completedAt
        ? new Date(routine.completedAt as Date).toISOString()
        : null,
    } as Routine;
  }
}
