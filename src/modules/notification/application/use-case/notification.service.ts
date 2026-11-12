import { HttpStatus, Inject, Injectable } from '@nestjs/common';
import { ApiException } from '../../../../shared/handler/http.exceptions.js';
import {
  NOTIFICATION_DELIVERY_PORT,
  type NotificationDeliveryPort,
} from '../ports/notification-delivery.port.js';
import type { PaymentSucceededNotification } from '../../domain/entities/payment-succeeded-notification.entity.js';
import {
  NOTIFICATION_DATA_PORT,
  type NotificationDataPort,
} from '../ports/notification-data.port.js';

@Injectable()
export class NotificationService {
  constructor(
    @Inject(NOTIFICATION_DELIVERY_PORT)
    private readonly delivery: NotificationDeliveryPort,
    @Inject(NOTIFICATION_DATA_PORT) private readonly data: NotificationDataPort,
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
    return this.data
      .createPaymentInbox(notification.userId, title, body, {
        orderId: notification.orderId,
        orderType: notification.orderType,
      })
      .then(() =>
        this.delivery.dispatchPaymentSucceeded(notification, title, body),
      );
  }

  getPreferences(userId: string) {
    return this.data.getPreferences(userId);
  }
  updatePreferences(
    userId: string,
    input: Parameters<NotificationDataPort['updatePreferences']>[1],
  ) {
    return this.data.updatePreferences(userId, input);
  }
  list(userId: string, page: number, limit: number) {
    return this.data.list(userId, page, limit);
  }
  async markRead(userId: string, id: string) {
    if (!(await this.data.markRead(userId, id)))
      throw new ApiException(
        HttpStatus.NOT_FOUND,
        'Notification was not found.',
        'NOTIFICATION_NOT_FOUND',
      );
    return { id, read: true };
  }
  async markAllRead(userId: string) {
    return { updatedCount: await this.data.markAllRead(userId) };
  }
}
