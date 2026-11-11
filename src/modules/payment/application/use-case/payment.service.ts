import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHmac, randomUUID, timingSafeEqual } from 'node:crypto';
import { VietQR } from 'vietqr';
import type { PoolClient } from 'pg';
import { DatabaseService } from '../../../../shared/database/database.service.js';
import { NotificationService } from '../../../notification/application/notification.service.js';
import {
  BadRequestException,
  ConflictException,
  NotFoundException,
  UnauthorizedException,
} from '../../../../shared/handler/http.exceptions.js';
import type { Uuid } from '../../../../shared/types/domain.types.js';
import type {
  PremiumPackage,
  SePayWebhookDto,
} from '../../presentation/payment.dto.js';

type OrderRow = {
  id: string;
  user_id: string;
  order_type: 'TOP_UP' | 'PREMIUM_PURCHASE';
  premium_package: PremiumPackage | null;
  premium_duration_days: number | null;
  amount_vnd: string;
  status: string;
  payment_code: string;
  expires_at: Date;
};

@Injectable()
export class PaymentService {
  private readonly qr = new VietQR();

  constructor(
    private readonly database: DatabaseService,
    private readonly config: ConfigService,
    private readonly notifications: NotificationService,
  ) {}

  createTopUp(userId: Uuid, amountVnd: number) {
    return this.createOrder(userId, 'TOP_UP', amountVnd, null);
  }

  async createPremiumCheckout(userId: Uuid, packageCode: PremiumPackage) {
    const selected = await this.database.query<{
      code: string;
      amount_vnd: string;
      duration_days: number;
    }>(
      `SELECT code, amount_vnd, duration_days FROM app_billing.premium_packages
       WHERE code = $1 AND is_active = TRUE`,
      [packageCode],
    );
    const premiumPackage = selected.rows[0];
    if (!premiumPackage)
      throw new NotFoundException(
        'Premium package was not found or is inactive.',
      );
    return this.createOrder(
      userId,
      'PREMIUM_PURCHASE',
      Number(premiumPackage.amount_vnd),
      premiumPackage.code,
      premiumPackage.duration_days,
    );
  }

  async getWallet(userId: Uuid) {
    return this.database.transaction(async (client) => {
      await client.query(
        `INSERT INTO app_billing.wallets (user_id) VALUES ($1)
         ON CONFLICT (user_id) DO NOTHING`,
        [userId],
      );
      const result = await client.query<{ balance_vnd: string }>(
        `SELECT balance_vnd FROM app_billing.wallets WHERE user_id = $1`,
        [userId],
      );
      return { balanceVnd: Number(result.rows[0]?.balance_vnd ?? 0) };
    });
  }

  async listTransactions(userId: Uuid, page: number, limit: number) {
    const offset = (page - 1) * limit;
    const result = await this.database.query<{
      id: string;
      transaction_type: string;
      direction: string;
      amount_vnd: string;
      balance_after_vnd: string;
      description: string;
      created_at: Date;
    }>(
      `SELECT id, transaction_type, direction, amount_vnd, balance_after_vnd, description, created_at
       FROM app_billing.wallet_transactions WHERE wallet_user_id = $1
       ORDER BY created_at DESC LIMIT $2 OFFSET $3`,
      [userId, limit, offset],
    );
    return result.rows.map((row) => ({
      id: row.id,
      type: row.transaction_type,
      direction: row.direction,
      amountVnd: Number(row.amount_vnd),
      balanceAfterVnd: Number(row.balance_after_vnd),
      description: row.description,
      createdAt: row.created_at,
    }));
  }

  async cancelOrder(userId: Uuid, orderId: string, reason: string) {
    const result = await this.database.query(
      `UPDATE app_billing.payment_orders
       SET status = 'CANCELLED', cancel_reason = $3, cancelled_at = CURRENT_TIMESTAMP
       WHERE id = $1 AND user_id = $2 AND status = 'PENDING'
       RETURNING id`,
      [orderId, userId, normalizeReason(reason)],
    );
    if (!result.rowCount) {
      throw new ConflictException(
        'Only your pending payment order can be cancelled.',
      );
    }
    return { id: orderId, status: 'CANCELLED' };
  }

  async getOrder(userId: Uuid, orderId: string) {
    const result = await this.database.query<OrderRow>(
      `SELECT id, user_id, order_type, premium_package, premium_duration_days, amount_vnd, status, payment_code, expires_at
       FROM app_billing.payment_orders WHERE id = $1 AND user_id = $2`,
      [orderId, userId],
    );
    const order = result.rows[0];
    if (!order) throw new NotFoundException('Payment order was not found.');
    return {
      id: order.id,
      type: order.order_type,
      packageCode: order.premium_package,
      amountVnd: Number(order.amount_vnd),
      status: order.status,
      expiresAt: order.expires_at,
    };
  }

  async refundOrder(orderId: string, reason: string) {
    return this.database.transaction(async (client) => {
      const orderResult = await client.query<OrderRow>(
        `SELECT id, user_id, order_type, premium_package, premium_duration_days, amount_vnd, status, payment_code, expires_at
         FROM app_billing.payment_orders WHERE id = $1 FOR UPDATE`,
        [orderId],
      );
      const order = orderResult.rows[0];
      if (!order) throw new NotFoundException('Payment order was not found.');
      if (order.status !== 'PAID')
        throw new ConflictException('Only paid orders can be refunded.');

      const adminId = await this.findAdminId(client);
      await this.lockWallets(client, [adminId, order.user_id]);
      const amount = Number(order.amount_vnd);
      const adminBalance = await this.adjustWallet(client, adminId, -amount);
      const userBalance = await this.adjustWallet(
        client,
        order.user_id,
        amount,
      );
      await this.insertLedger(
        client,
        adminId,
        order.id,
        'PREMIUM_REFUND',
        'DEBIT',
        amount,
        adminBalance,
        `Refund to customer: ${normalizeReason(reason)}`,
      );
      await this.insertLedger(
        client,
        order.user_id,
        order.id,
        'PREMIUM_REFUND',
        'CREDIT',
        amount,
        userBalance,
        `Internal refund: ${normalizeReason(reason)}`,
      );
      await client.query(
        `UPDATE app_billing.payment_orders SET status = 'REFUNDED', refunded_at = CURRENT_TIMESTAMP, cancel_reason = $2 WHERE id = $1`,
        [order.id, normalizeReason(reason)],
      );
      if (order.order_type === 'PREMIUM_PURCHASE') {
        await client.query(
          `UPDATE app_billing.premium_subscriptions SET status = 'REFUNDED' WHERE payment_order_id = $1`,
          [order.id],
        );
        await this.refreshEntitlement(client, order.user_id);
      }
      return { id: order.id, status: 'REFUNDED' };
    });
  }

  verifyWebhook(
    rawBody: Buffer | undefined,
    signature: string | undefined,
    timestamp: string | undefined,
  ) {
    if (!rawBody || !signature || !timestamp || !/^\d+$/.test(timestamp)) {
      throw new UnauthorizedException('Invalid SePay webhook authentication.');
    }
    if (Math.abs(Date.now() / 1000 - Number(timestamp)) > 300) {
      throw new UnauthorizedException('Expired SePay webhook timestamp.');
    }
    const expected = `sha256=${createHmac(
      'sha256',
      this.config.getOrThrow<string>('GLOWNSCAN_SEPAY_WEBHOOK_SECRET'),
    )
      .update(`${timestamp}.${rawBody.toString('utf8')}`)
      .digest('hex')}`;
    const received = Buffer.from(signature);
    const expectedBuffer = Buffer.from(expected);
    if (
      received.length !== expectedBuffer.length ||
      !timingSafeEqual(received, expectedBuffer)
    ) {
      throw new UnauthorizedException('Invalid SePay webhook signature.');
    }
  }

  async processWebhook(payload: SePayWebhookDto) {
    const eventId = String(payload.id);
    const paymentCode = extractPaymentCode(payload);
    if (!paymentCode)
      throw new BadRequestException(
        'SePay webhook does not contain a payment code.',
      );
    if (!['in', 'credit'].includes(payload.transferType.toLowerCase())) {
      return { success: true };
    }
    const notification = await this.database.transaction(async (client) => {
      const event = await client.query(
        `INSERT INTO app_billing.sepay_webhook_events (sepay_transaction_id, payment_code, amount_vnd)
         VALUES ($1, $2, $3) ON CONFLICT (sepay_transaction_id) DO NOTHING RETURNING sepay_transaction_id`,
        [eventId, paymentCode, payload.transferAmount],
      );
      if (!event.rowCount) return null;
      const orderResult = await client.query<OrderRow>(
        `SELECT id, user_id, order_type, premium_package, premium_duration_days, amount_vnd, status, payment_code, expires_at
         FROM app_billing.payment_orders WHERE payment_code = $1 FOR UPDATE`,
        [paymentCode],
      );
      const order = orderResult.rows[0];
      if (
        !order ||
        order.status !== 'PENDING' ||
        order.expires_at <= new Date() ||
        Number(order.amount_vnd) !== payload.transferAmount
      ) {
        await client.query(
          `UPDATE app_billing.sepay_webhook_events SET processing_result = 'IGNORED' WHERE sepay_transaction_id = $1`,
          [eventId],
        );
        return null;
      }
      await client.query(
        `UPDATE app_billing.payment_orders SET status = 'PAID', paid_at = CURRENT_TIMESTAMP, sepay_transaction_id = $2 WHERE id = $1`,
        [order.id, eventId],
      );
      const adminId = await this.findAdminId(client);
      await this.lockWallets(client, [adminId, order.user_id]);
      const amount = Number(order.amount_vnd);
      const customerBalance = await this.adjustWallet(
        client,
        order.user_id,
        amount,
      );
      await this.insertLedger(
        client,
        order.user_id,
        order.id,
        'SEPAY_TOP_UP',
        'CREDIT',
        amount,
        customerBalance,
        'SePay bank transfer received',
      );
      const collectionBalance = await this.adjustWallet(
        client,
        adminId,
        amount,
      );
      await this.insertLedger(
        client,
        adminId,
        order.id,
        'SEPAY_COLLECTION',
        'CREDIT',
        amount,
        collectionBalance,
        `SePay collection ${order.payment_code}`,
      );
      if (order.order_type === 'PREMIUM_PURCHASE') {
        const afterDebit = await this.adjustWallet(
          client,
          order.user_id,
          -amount,
        );
        const adminBalance = await this.adjustWallet(client, adminId, amount);
        await this.insertLedger(
          client,
          order.user_id,
          order.id,
          'PREMIUM_PURCHASE',
          'DEBIT',
          amount,
          afterDebit,
          `Premium package ${order.premium_package}`,
        );
        await this.insertLedger(
          client,
          adminId,
          order.id,
          'PREMIUM_SALE',
          'CREDIT',
          amount,
          adminBalance,
          `Premium sale ${order.payment_code}`,
        );
        await this.createSubscription(client, order);
      }
      await client.query(
        `UPDATE app_billing.sepay_webhook_events SET processing_result = 'APPLIED' WHERE sepay_transaction_id = $1`,
        [eventId],
      );
      return {
        userId: order.user_id,
        orderId: order.id,
        amountVnd: amount,
        orderType: order.order_type,
        packageCode: order.premium_package,
      };
    });
    if (notification)
      await this.notifications.notifyPaymentSucceeded(notification);
    return { success: true };
  }

  private async createOrder(
    userId: Uuid,
    orderType: 'TOP_UP' | 'PREMIUM_PURCHASE',
    amountVnd: number,
    packageCode: PremiumPackage | null,
    durationDays: number | null = null,
  ) {
    const paymentCode = `GS${randomUUID().replaceAll('-', '').slice(0, 20).toUpperCase()}`;
    const result = await this.database.query<OrderRow>(
      `INSERT INTO app_billing.payment_orders (user_id, order_type, premium_package, premium_duration_days, amount_vnd, payment_code, expires_at)
       VALUES ($1, $2, $3, $4, $5, $6, CURRENT_TIMESTAMP + ($7::int * INTERVAL '1 minute'))
       RETURNING id, user_id, order_type, premium_package, premium_duration_days, amount_vnd, status, payment_code, expires_at`,
      [
        userId,
        orderType,
        packageCode,
        durationDays,
        amountVnd,
        paymentCode,
        this.orderTtlMinutes,
      ],
    );
    const order = result.rows[0];
    return {
      id: order.id,
      type: order.order_type,
      amountVnd,
      paymentCode,
      expiresAt: order.expires_at,
      qrImageUrl: this.qr.genQuickLink({
        bank: this.config.getOrThrow<string>('GLOWNSCAN_BANK_BIN'),
        accountName: this.config.getOrThrow<string>(
          'GLOWNSCAN_BANK_ACCOUNT_NAME',
        ),
        accountNumber: this.config.getOrThrow<string>(
          'GLOWNSCAN_SEPAY_BANK_ACCOUNT_NUMBER',
        ),
        amount: amountVnd,
        memo: paymentCode,
        template: 'compact',
      }),
    };
  }

  private get orderTtlMinutes() {
    return Number(
      this.config.get<string>('GLOWNSCAN_PAYMENT_ORDER_TTL_MINUTES', '15'),
    );
  }
  private async findAdminId(client: PoolClient) {
    const email =
      this.config.get<string>('GLOWNSCAN_ADMIN_EMAI')?.trim() ||
      this.config.getOrThrow<string>('GLOWNSCAN_ADMIN_EMAIL').trim();
    const result = await client.query<{ id: string }>(
      `SELECT id FROM app_auth.users WHERE email = lower($1) AND status = 'ACTIVE' AND deleted_at IS NULL FOR UPDATE`,
      [email],
    );
    if (!result.rows[0])
      throw new ConflictException(
        'Configured payment administrator is unavailable.',
      );
    return result.rows[0].id;
  }
  private async lockWallets(client: PoolClient, userIds: string[]) {
    for (const userId of [...new Set(userIds)].sort())
      await client.query(
        `INSERT INTO app_billing.wallets (user_id) VALUES ($1) ON CONFLICT (user_id) DO NOTHING`,
        [userId],
      );
    await client.query(
      `SELECT user_id FROM app_billing.wallets WHERE user_id = ANY($1::uuid[]) ORDER BY user_id FOR UPDATE`,
      [userIds],
    );
  }
  private async adjustWallet(
    client: PoolClient,
    userId: string,
    delta: number,
  ) {
    const result = await client.query<{ balance_vnd: string }>(
      `UPDATE app_billing.wallets SET balance_vnd = balance_vnd + $2 WHERE user_id = $1 AND balance_vnd + $2 >= 0 RETURNING balance_vnd`,
      [userId, delta],
    );
    if (!result.rows[0])
      throw new ConflictException('Wallet does not have enough balance.');
    return Number(result.rows[0].balance_vnd);
  }
  private insertLedger(
    client: PoolClient,
    userId: string,
    orderId: string,
    type: string,
    direction: string,
    amount: number,
    balance: number,
    description: string,
  ) {
    return client.query(
      `INSERT INTO app_billing.wallet_transactions (wallet_user_id, payment_order_id, transaction_type, direction, amount_vnd, balance_after_vnd, description) VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [userId, orderId, type, direction, amount, balance, description],
    );
  }
  private async createSubscription(client: PoolClient, order: OrderRow) {
    const active = await client.query<{ expires_at: Date }>(
      `SELECT expires_at FROM app_billing.premium_subscriptions WHERE user_id = $1 AND status = 'ACTIVE' AND expires_at > CURRENT_TIMESTAMP ORDER BY expires_at DESC LIMIT 1 FOR UPDATE`,
      [order.user_id],
    );
    const startsAt = active.rows[0]?.expires_at ?? new Date();
    const expiresAt = new Date(startsAt);
    expiresAt.setUTCDate(
      expiresAt.getUTCDate() + Number(order.premium_duration_days),
    );
    await client.query(
      `INSERT INTO app_billing.premium_subscriptions (user_id, payment_order_id, package_code, starts_at, expires_at) VALUES ($1, $2, $3, $4, $5)`,
      [order.user_id, order.id, order.premium_package, startsAt, expiresAt],
    );
    await client.query(
      `INSERT INTO app_skin_analysis.user_analysis_entitlements (user_id, plan, daily_quota) VALUES ($1, 'PREMIUM', NULL) ON CONFLICT (user_id) DO UPDATE SET plan = 'PREMIUM', daily_quota = NULL, updated_at = CURRENT_TIMESTAMP`,
      [order.user_id],
    );
  }
  private async refreshEntitlement(client: PoolClient, userId: string) {
    const result = await client.query(
      `SELECT 1 FROM app_billing.premium_subscriptions WHERE user_id = $1 AND status = 'ACTIVE' AND expires_at > CURRENT_TIMESTAMP LIMIT 1`,
      [userId],
    );
    if (!result.rowCount)
      await client.query(
        `INSERT INTO app_skin_analysis.user_analysis_entitlements (user_id, plan) VALUES ($1, 'FREE') ON CONFLICT (user_id) DO UPDATE SET plan = 'FREE', daily_quota = NULL, updated_at = CURRENT_TIMESTAMP`,
        [userId],
      );
  }
}

function normalizeReason(value: string) {
  const reason = value.trim();
  if (!reason)
    throw new BadRequestException(
      'A cancellation or refund reason is required.',
    );
  return reason.slice(0, 500);
}

export function extractPaymentCode(
  payload: Pick<SePayWebhookDto, 'code' | 'content' | 'description'>,
): string {
  const directCode = payload.code?.trim();
  if (directCode) return directCode.toUpperCase();

  for (const value of [payload.content, payload.description]) {
    if (!value) continue;
    const qrMemo = value.match(/\bQR\s*-\s*([A-Z0-9]+)\b/i)?.[1];
    if (qrMemo) return qrMemo.toUpperCase();
  }
  return '';
}
