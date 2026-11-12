import type { Uuid } from '../../../../shared/types/domain.types.js';

export interface SkinConcern {
  id: Uuid;
  code: string;
  name: string;
  description: string | null;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}
