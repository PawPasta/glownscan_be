import type { Uuid } from '../../../../shared/types/domain.types.js';

export interface AffiliateLink {
  id: Uuid;
  productId: Uuid;
  provider: string;
  url: string;
  label: string | null;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}
