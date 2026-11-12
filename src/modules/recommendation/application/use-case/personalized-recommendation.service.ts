import { Inject, Injectable } from '@nestjs/common';
import type { Uuid } from '../../../../shared/types/domain.types.js';
import {
  RECOMMENDATION_DATA_PORT,
  type RecommendationDataPort,
} from '../ports/recommendation-data.port.js';

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
  constructor(
    @Inject(RECOMMENDATION_DATA_PORT)
    private readonly recommendationData: RecommendationDataPort,
  ) {}

  async getForUser(userId: Uuid, limit: number) {
    const context = await this.recommendationData.loadSkinContext(userId);
    const concernCodes = this.concernsFrom(
      context.assessment,
      context.analysis,
    );
    const products = await this.recommendationData.findProducts(
      concernCodes,
      limit,
    );
    return {
      generatedAt: new Date(),
      source: {
        assessmentAvailable: context.assessment !== null,
        analysisAvailable: context.analysis !== null,
        concernCodes,
      },
      items: products.map((product) => ({
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
