import type { Uuid } from '../../../../shared/types/domain.types.js';

export const RECOMMENDATION_DATA_PORT = Symbol('RECOMMENDATION_DATA_PORT');

export interface RecommendationSkinContext {
  assessment: { concerns?: string[] } | null;
  analysis: {
    metrics?: Record<string, { score?: number; visibility?: string }>;
  } | null;
}

export interface RecommendedProduct {
  id: string;
  name: string;
  brand: string | null;
  description: string | null;
  imageUrl: string | null;
  matchedConcerns: string[];
}

export interface RecommendationDataPort {
  loadSkinContext(userId: Uuid): Promise<RecommendationSkinContext>;
  findProducts(
    concernCodes: string[],
    limit: number,
  ): Promise<RecommendedProduct[]>;
}
