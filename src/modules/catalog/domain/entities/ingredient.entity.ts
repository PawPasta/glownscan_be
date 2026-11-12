import type { Uuid } from '../../../../shared/types/domain.types.js';

export interface Ingredient {
  id: Uuid;
  name: string;
  description: string | null;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}
