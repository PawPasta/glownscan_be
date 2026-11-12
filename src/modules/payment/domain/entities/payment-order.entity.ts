import type { Uuid } from '../../../../shared/types/domain.types.js';

export type PaymentOrderType = 'TOP_UP' | 'PREMIUM_PURCHASE';
export type PaymentOrderStatus =
  'PENDING' | 'PAID' | 'CANCELLED' | 'EXPIRED' | 'REFUNDED';

export interface PaymentOrder {
  id: Uuid;
  userId: Uuid;
  type: PaymentOrderType;
  packageCode: string | null;
  amountVnd: number;
  status: PaymentOrderStatus;
  paymentCode: string;
  expiresAt: Date;
  createdAt: Date;
}
