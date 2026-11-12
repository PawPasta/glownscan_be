import type { PaymentSucceededNotification } from '../../domain/entities/payment-succeeded-notification.entity.js';

export const NOTIFICATION_DELIVERY_PORT = Symbol('NOTIFICATION_DELIVERY_PORT');

export interface NotificationDeliveryPort {
  dispatchPaymentSucceeded(
    notification: PaymentSucceededNotification,
    title: string,
    body: string,
  ): Promise<void>;
}
