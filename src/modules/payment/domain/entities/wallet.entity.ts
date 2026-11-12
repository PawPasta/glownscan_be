import type { Uuid } from '../../../../shared/types/domain.types.js';

export interface Wallet {
  userId: Uuid;
  balanceVnd: number;
  updatedAt: Date;
}
