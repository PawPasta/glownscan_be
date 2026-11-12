import type { Uuid } from '../../../../shared/types/domain.types.js';
import type { PaymentSucceededNotification } from '../../../notification/domain/entities/payment-succeeded-notification.entity.js';

export const PAYMENT_DATA_PORT = Symbol('PAYMENT_DATA_PORT');

export interface ActivePremiumPackage {
  code: string;
  amountVnd: number;
  durationDays: number;
}

export interface PremiumPackageOffer extends Omit<
  ActivePremiumPackage,
  'amountVnd'
> {
  name: string;
  description: string;
  priceVnd: number;
  displayOrder: number;
  isActive: true;
}

export interface SubscriptionSnapshot {
  isPremium: boolean;
  packageCode: string | null;
  startedAt: Date | null;
  expiresAt: Date | null;
  status: 'ACTIVE' | 'EXPIRED' | 'CANCELLED' | 'NONE';
}

export interface PaymentOrderListItem {
  id: string;
  type: 'TOP_UP' | 'PREMIUM_PURCHASE';
  packageCode: string | null;
  amountVnd: number;
  status: string;
  paymentCode: string;
  createdAt: Date;
  expiresAt: Date;
  paidAt: Date | null;
}

export interface AdminPaymentOrderListItem extends PaymentOrderListItem {
  userId: string;
  userEmail: string;
  receivedAmountVnd: number;
  providerReference: string | null;
  reconciliationStatus:
    'MATCHED' | 'UNMATCHED' | 'PARTIAL' | 'OVERPAID' | 'LATE' | 'MANUAL_REVIEW';
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
  listActivePackages(): Promise<PremiumPackageOffer[]>;
  findSubscription(userId: Uuid): Promise<SubscriptionSnapshot>;
  getOrCreateWallet(userId: Uuid): Promise<{ balanceVnd: number }>;
  listTransactions(
    userId: Uuid,
    page: number,
    limit: number,
  ): Promise<unknown[]>;
  listOwnedOrders(
    userId: Uuid,
    page: number,
    limit: number,
  ): Promise<{
    items: PaymentOrderListItem[];
    page: number;
    limit: number;
    total: number;
  }>;
  listAdminOrders(
    page: number,
    limit: number,
    status?: string,
  ): Promise<{
    items: AdminPaymentOrderListItem[];
    page: number;
    limit: number;
    total: number;
  }>;
  adminDashboardSummary(): Promise<{
    pendingOrders: number;
    paidOrdersToday: number;
    walletBalanceTotalVnd: number;
    activePremiumSubscribers: number;
    failedPaymentNotifications: number;
  }>;
  createSupportRequest(input: {
    userId: Uuid;
    orderId: string;
    subject: string;
    note: string;
  }): Promise<{
    id: string;
    orderId: string;
    status: 'OPEN';
    createdAt: Date;
  } | null>;
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
