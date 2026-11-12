import type { Uuid } from '../../../../shared/types/domain.types.js';

export interface CatalogProduct {
  id: Uuid;
  name: string;
  brand: string | null;
  description: string | null;
  imageUrl: string | null;
  isActive: boolean;
  ingredientIds: Uuid[];
  skinConcernIds: Uuid[];
  createdAt: Date;
  updatedAt: Date;
}
