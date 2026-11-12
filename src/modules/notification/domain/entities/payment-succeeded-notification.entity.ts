import type { Uuid } from '../../../../shared/types/domain.types.js';

export interface PaymentSucceededNotification {
  userId: Uuid;
  orderId: Uuid;
  amountVnd: number;
  orderType: 'TOP_UP' | 'PREMIUM_PURCHASE';
  packageCode: string | null;
}
