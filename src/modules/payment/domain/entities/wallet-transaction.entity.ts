import type { Uuid } from '../../../../shared/types/domain.types.js';

export interface WalletTransaction {
  id: Uuid;
  walletUserId: Uuid;
  type: string;
  direction: 'CREDIT' | 'DEBIT';
  amountVnd: number;
  balanceAfterVnd: number;
  description: string;
  createdAt: Date;
}
