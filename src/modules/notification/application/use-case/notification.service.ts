import { Inject, Injectable } from '@nestjs/common';
import {
  NOTIFICATION_DELIVERY_PORT,
  type NotificationDeliveryPort,
} from '../ports/notification-delivery.port.js';
import type { PaymentSucceededNotification } from '../../domain/entities/payment-succeeded-notification.entity.js';

@Injectable()
export class NotificationService {
  constructor(
    @Inject(NOTIFICATION_DELIVERY_PORT)
    private readonly delivery: NotificationDeliveryPort,
  ) {}

  notifyPaymentSucceeded(
    notification: PaymentSucceededNotification,
  ): Promise<void> {
    const title = 'Payment successful';
    const amount = new Intl.NumberFormat('en-US').format(
      notification.amountVnd,
    );
    const body =
      notification.orderType === 'TOP_UP'
        ? `Your GlowScan wallet top-up of ${amount} VND was successful.`
        : `Your ${notification.packageCode ?? 'PREMIUM'} payment of ${amount} VND was successful.`;
    return this.delivery.dispatchPaymentSucceeded(notification, title, body);
  }
}
