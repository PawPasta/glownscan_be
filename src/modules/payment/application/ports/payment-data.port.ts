import type { Uuid } from '../../../../shared/types/domain.types.js';
import type { PaymentSucceededNotification } from '../../../notification/domain/entities/payment-succeeded-notification.entity.js';

export const PAYMENT_DATA_PORT = Symbol('PAYMENT_DATA_PORT');

export interface ActivePremiumPackage {
  code: string;
  amountVnd: number;
  durationDays: number;
}

export interface PaymentOrderRecord {
  id: string;
  user_id: string;
  order_type: 'TOP_UP' | 'PREMIUM_PURCHASE';
  premium_package: string | null;
  premium_duration_days: number | null;
  amount_vnd: string;
  status: string;
  payment_code: string;
  expires_at: Date;
}

export interface PaymentDataPort {
  findActivePackage(code: string): Promise<ActivePremiumPackage | null>;
  getOrCreateWallet(userId: Uuid): Promise<{ balanceVnd: number }>;
  listTransactions(
    userId: Uuid,
    page: number,
    limit: number,
  ): Promise<unknown[]>;
  cancelPendingOrder(
    userId: Uuid,
    orderId: string,
    reason: string,
  ): Promise<boolean>;
  findOwnedOrder(
    userId: Uuid,
    orderId: string,
  ): Promise<PaymentOrderRecord | null>;
  refundPaidOrder(
    orderId: string,
    reason: string,
    adminEmail: string,
  ): Promise<'REFUNDED' | 'NOT_FOUND' | 'NOT_PAID'>;
  createOrder(input: {
    userId: Uuid;
    orderType: 'TOP_UP' | 'PREMIUM_PURCHASE';
    amountVnd: number;
    packageCode: string | null;
    durationDays: number | null;
    paymentCode: string;
    ttlMinutes: number;
  }): Promise<PaymentOrderRecord>;
  applySePayPayment(input: {
    eventId: string;
    paymentCode: string;
    transferType: string;
    transferAmount: number;
    adminEmail: string;
  }): Promise<PaymentSucceededNotification | null>;
}
