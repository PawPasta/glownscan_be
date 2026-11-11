import { Injectable } from '@nestjs/common';
import { DatabaseService } from '../../../shared/database/database.service.js';
import type { Uuid } from '../../../shared/types/domain.types.js';

const METRIC_CONCERNS: Record<string, string> = {
  acne: 'ACNE',
  redness: 'REDNESS',
  darkSpots: 'DARK_SPOTS',
  pores: 'PORES',
  dryness: 'DRYNESS',
  oiliness: 'OILINESS',
  unevenTexture: 'TEXTURE',
};

@Injectable()
export class PersonalizedRecommendationService {
  constructor(private readonly database: DatabaseService) {}

  async getForUser(userId: Uuid, limit: number) {
    const context = await this.loadContext(userId);
    const concernCodes = this.concernsFrom(
      context.assessment,
      context.analysis,
    );
    const products = await this.database.query<{
      id: string;
      name: string;
      brand: string | null;
      description: string | null;
      imageUrl: string | null;
      matchedConcerns: string[];
    }>(
      `SELECT p.id, p.name, p.brand, p.description, p.image_url AS "imageUrl",
              COALESCE(array_agg(DISTINCT c.code) FILTER (WHERE c.code = ANY($1::varchar[])), '{}') AS "matchedConcerns"
       FROM app_catalog.products p
       LEFT JOIN app_catalog.product_skin_concerns pc ON pc.product_id = p.id
       LEFT JOIN app_catalog.skin_concerns c ON c.id = pc.skin_concern_id AND c.is_active
       WHERE p.is_active
       GROUP BY p.id
       ORDER BY COUNT(c.code) FILTER (WHERE c.code = ANY($1::varchar[])) DESC, p.created_at DESC
       LIMIT $2`,
      [concernCodes, limit],
    );
    return {
      generatedAt: new Date(),
      source: {
        assessmentAvailable: context.assessment !== null,
        analysisAvailable: context.analysis !== null,
        concernCodes,
      },
      items: products.rows.map((product) => ({
        ...product,
        reasons: product.matchedConcerns.length
          ? product.matchedConcerns.map(
              (code) => `Matches your ${code.toLowerCase()} concern.`,
            )
          : [
              'Popular active catalog product while more skin context is needed.',
            ],
        disclaimer: 'Cosmetic product information only; not medical advice.',
      })),
    };
  }

  private async loadContext(userId: Uuid) {
    const [assessment, analysis] = await Promise.all([
      this.database.query<{ answers: { concerns?: string[] } }>(
        'SELECT answers FROM app_skin_analysis.user_assessments WHERE user_id = $1',
        [userId],
      ),
      this.database.query<{
        provider_payload: {
          metrics?: Record<string, { score?: number; visibility?: string }>;
        };
      }>(
        `SELECT r.provider_payload FROM app_skin_analysis.analysis_results r
         JOIN app_skin_analysis.analysis_sessions s ON s.id = r.session_id
         WHERE s.user_id = $1 AND s.status = 'SUCCEEDED' AND r.quality_accepted
         ORDER BY s.completed_at DESC LIMIT 1`,
        [userId],
      ),
    ]);
    return {
      assessment: assessment.rows[0]?.answers ?? null,
      analysis: analysis.rows[0]?.provider_payload ?? null,
    };
  }

  private concernsFrom(
    assessment: { concerns?: string[] } | null,
    analysis: {
      metrics?: Record<string, { score?: number; visibility?: string }>;
    } | null,
  ) {
    const codes = new Set(
      (assessment?.concerns ?? []).filter((code) => code !== 'NONE'),
    );
    for (const [metric, value] of Object.entries(analysis?.metrics ?? {})) {
      if (
        value.visibility === 'CLEAR' &&
        (value.score ?? 0) >= 50 &&
        METRIC_CONCERNS[metric]
      )
        codes.add(METRIC_CONCERNS[metric]);
    }
    return [...codes];
  }
}
