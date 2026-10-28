import type { Uuid } from '../../../../shared/types/domain.types.js';

export type SkinType = 'NORMAL' | 'DRY' | 'OILY' | 'COMBINATION';
export type SensitivityLevel = 'LOW' | 'MEDIUM' | 'HIGH';

export interface SkinProfile {
  id: Uuid;
  skinType: SkinType | null;
  sensitivityLevel: SensitivityLevel | null;
  notes: string | null;
  createdAt: Date;
  updatedAt: Date;
}
