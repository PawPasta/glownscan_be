import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { getApps, initializeApp } from 'firebase-admin/app';
import { getMessaging, type Messaging } from 'firebase-admin/messaging';
import nodemailer, { type Transporter } from 'nodemailer';
import { DatabaseService } from '../../../../shared/database/database.service.js';
import type { PaymentSucceededNotification } from '../../domain/entities/payment-succeeded-notification.entity.js';
import type { NotificationDeliveryPort } from '../../application/ports/notification-delivery.port.js';

const firebaseAppName = 'glownscan-notification';

@Injectable()
export class NotificationDispatchAdapter implements NotificationDeliveryPort {
  private readonly logger = new Logger(NotificationDispatchAdapter.name);
  private readonly messaging: Messaging;
  private readonly transporter: Transporter;
  private readonly from: string;

  constructor(
    private readonly database: DatabaseService,
    config: ConfigService,
  ) {
    const projectId = config.getOrThrow<string>(
      'GLOWNSCAN_FIREBASE_PROJECT_ID',
    );
    const app =
      getApps().find((candidate) => candidate.name === firebaseAppName) ??
      initializeApp({ projectId }, firebaseAppName);
    this.messaging = getMessaging(app);

    const host = config.getOrThrow<string>('GLOWNSCAN_SMTP_HOST');
    const user = config.getOrThrow<string>('GLOWNSCAN_SMTP_USER');
    const password = config.getOrThrow<string>('GLOWNSCAN_SMTP_PASSWORD');
    this.from = config.get<string>('GLOWNSCAN_SMTP_FROM') ?? user;
    this.transporter = nodemailer.createTransport({
      host,
      port: Number(config.get<string>('GLOWNSCAN_SMTP_PORT', '587')),
      secure: config.get<string>('GLOWNSCAN_SMTP_SECURE', 'false') === 'true',
      auth: { user, pass: password },
    });
  }

  async dispatchPaymentSucceeded(
    notification: PaymentSucceededNotification,
    title: string,
    body: string,
  ): Promise<void> {
    try {
      const [user, tokens] = await Promise.all([
        this.database.query<{ email: string }>(
          `SELECT email FROM app_auth.users WHERE id = $1 AND deleted_at IS NULL`,
          [notification.userId],
        ),
        this.database.query<{ registration_value: string }>(
          `SELECT pr.registration_value
         FROM app_auth.push_registrations pr
         JOIN app_auth.user_devices ud ON ud.id = pr.device_id
         WHERE ud.user_id = $1 AND pr.provider = 'FCM'
           AND pr.registration_type = 'FCM_TOKEN'
           AND pr.status = 'ACTIVE' AND pr.notification_enabled = TRUE`,
          [notification.userId],
        ),
      ]);
      await Promise.all([
        this.trackDelivery(
          notification.orderId,
          'FCM',
          tokens.rows.length === 0,
          () =>
            this.sendPush(
              tokens.rows.map((token) => token.registration_value),
              title,
              body,
              notification,
            ),
        ),
        this.trackDelivery(
          notification.orderId,
          'EMAIL',
          !user.rows[0]?.email,
          () => this.sendEmail(user.rows[0]?.email, title, body, notification),
        ),
      ]);
    } catch (error) {
      await Promise.all([
        this.recordAttempt(notification.orderId, 'FCM', 'FAILED'),
        this.recordAttempt(notification.orderId, 'EMAIL', 'FAILED'),
      ]);
      this.logger.error(
        'Payment notification could not be prepared.',
        error instanceof Error ? error.stack : undefined,
      );
    }
  }

  private async trackDelivery(
    orderId: string,
    channel: 'FCM' | 'EMAIL',
    skipped: boolean,
    send: () => Promise<void>,
  ) {
    let status: 'SUCCEEDED' | 'FAILED' | 'SKIPPED' = skipped
      ? 'SKIPPED'
      : 'SUCCEEDED';
    if (!skipped) {
      try {
        await send();
      } catch (error) {
        status = 'FAILED';
        this.logger.error(
          'Payment notification delivery failed.',
          error instanceof Error ? error.stack : undefined,
        );
      }
    }
    await this.recordAttempt(orderId, channel, status);
    return status;
  }

  private async recordAttempt(
    orderId: string,
    channel: 'FCM' | 'EMAIL',
    status: 'SUCCEEDED' | 'FAILED' | 'SKIPPED',
  ) {
    try {
      await this.database.query(
        `INSERT INTO app_billing.payment_notification_attempts (order_id, channel, status)
         VALUES ($1, $2, $3)`,
        [orderId, channel, status],
      );
    } catch (error) {
      this.logger.error(
        'Payment notification attempt could not be recorded.',
        error instanceof Error ? error.stack : undefined,
      );
    }
  }

  private async sendPush(
    tokens: string[],
    title: string,
    body: string,
    notification: PaymentSucceededNotification,
  ): Promise<void> {
    if (!tokens.length) return;
    for (let start = 0; start < tokens.length; start += 500) {
      const result = await this.messaging.sendEachForMulticast({
        tokens: tokens.slice(start, start + 500),
        notification: { title, body },
        data: {
          type: 'PAYMENT_SUCCEEDED',
          orderId: notification.orderId,
          orderType: notification.orderType,
        },
      });
      if (result.failureCount) {
        this.logger.warn(
          `Payment push delivery had ${result.failureCount} failed recipient(s).`,
        );
        throw new Error('Some FCM deliveries failed.');
      }
    }
  }

  private async sendEmail(
    email: string | undefined,
    title: string,
    body: string,
    notification: PaymentSucceededNotification,
  ): Promise<void> {
    if (!email) return;
    await this.transporter.sendMail({
      from: this.from,
      to: email,
      subject: `GlowScan - ${title}`,
      text: `${body}\nTransaction ID: ${notification.orderId}`,
      html: `<p>${escapeHtml(body)}</p><p>Transaction ID: ${escapeHtml(notification.orderId)}</p>`,
    });
  }
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (character) => {
    const entities: Record<string, string> = {
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#39;',
    };
    return entities[character];
  });
}
