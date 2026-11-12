import { Injectable } from '@nestjs/common';
import { DatabaseService } from '../../../../shared/database/database.service.js';
import type { Uuid } from '../../../../shared/types/domain.types.js';
import type {
  RecommendationDataPort,
  RecommendationSkinContext,
  RecommendedProduct,
} from '../../application/ports/recommendation-data.port.js';

@Injectable()
export class PostgresRecommendationDataAdapter implements RecommendationDataPort {
  constructor(private readonly database: DatabaseService) {}

  async loadSkinContext(userId: Uuid): Promise<RecommendationSkinContext> {
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

  async findProducts(
    concernCodes: string[],
    limit: number,
  ): Promise<RecommendedProduct[]> {
    const result = await this.database.query<RecommendedProduct>(
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
    return result.rows;
  }
}
