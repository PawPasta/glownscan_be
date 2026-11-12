import type { Uuid } from '../../../../shared/types/domain.types.js';

export interface PersonalizedRecommendation {
  productId: Uuid;
  matchedConcerns: string[];
  reasons: string[];
  disclaimer: string;
}
