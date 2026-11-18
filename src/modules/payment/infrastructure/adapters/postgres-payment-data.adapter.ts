import { Injectable } from '@nestjs/common';
import { DatabaseService } from '../../../../shared/database/database.service.js';
import type { Uuid } from '../../../../shared/types/domain.types.js';
import type {
  AdminPaymentOrderListItem,
  ActivePremiumPackage,
  PaymentOrderListItem,
  PaymentDataPort,
  PaymentOrderRecord,
  PremiumPackageOffer,
  SubscriptionSnapshot,
} from '../../application/ports/payment-data.port.js';
import type { PaymentSucceededNotification } from '../../../notification/domain/entities/payment-succeeded-notification.entity.js';
import type { SePayWebhookEvent } from '../../application/types/sepay-webhook-event.js';
import type { PoolClient } from 'pg';

@Injectable()
export class PostgresPaymentDataAdapter implements PaymentDataPort {
  constructor(private readonly database: DatabaseService) {}

  async findActivePackage(code: string): Promise<ActivePremiumPackage | null> {
    const result = await this.database.query<{
      code: string;
      amount_vnd: string;
      duration_days: number;
    }>(
      `SELECT code, amount_vnd, duration_days FROM app_billing.premium_packages
       WHERE code = $1 AND is_active = TRUE`,
      [code],
    );
    const row = result.rows[0];
    return row
      ? {
          code: row.code,
          amountVnd: Number(row.amount_vnd),
          durationDays: row.duration_days,
        }
      : null;
  }

  async listActivePackages(): Promise<PremiumPackageOffer[]> {
    const result = await this.database.query<{
      code: string;
      name: string;
      amount_vnd: string;
      duration_days: number;
      display_order: number;
    }>(
      `SELECT code, name, amount_vnd, duration_days,
              row_number() OVER (ORDER BY duration_days, code)::int AS display_order
       FROM app_billing.premium_packages WHERE is_active = TRUE
       ORDER BY duration_days, code`,
    );
    return result.rows.map((row) => ({
      code: row.code,
      name: row.name,
      description: `Premium access for ${row.duration_days} days.`,
      priceVnd: Number(row.amount_vnd),
      durationDays: row.duration_days,
      displayOrder: row.display_order,
      isActive: true,
    }));
  }

  async findSubscription(userId: Uuid): Promise<SubscriptionSnapshot> {
    const result = await this.database.query<{
      package_code: string;
      starts_at: Date;
      expires_at: Date;
      status: string;
      is_active: boolean;
    }>(
      `SELECT package_code, starts_at, expires_at, status,
              (status = 'ACTIVE' AND expires_at > CURRENT_TIMESTAMP) AS is_active
       FROM app_billing.premium_subscriptions
       WHERE user_id = $1
       ORDER BY (status = 'ACTIVE' AND expires_at > CURRENT_TIMESTAMP) DESC,
                expires_at DESC, created_at DESC LIMIT 1`,
      [userId],
    );
    const row = result.rows[0];
    if (!row)
      return {
        isPremium: false,
        packageCode: null,
        startedAt: null,
        expiresAt: null,
        status: 'NONE',
      };
    const status: SubscriptionSnapshot['status'] = row.is_active
      ? 'ACTIVE'
      : row.status === 'REFUNDED'
        ? 'CANCELLED'
        : 'EXPIRED';
    return {
      isPremium: status === 'ACTIVE',
      packageCode: row.package_code,
      startedAt: row.starts_at,
      expiresAt: row.expires_at,
      status,
    };
  }

  async hasPermission(userId: Uuid, permissionCode: string): Promise<boolean> {
    const result = await this.database.query<{ granted: boolean }>(
      `SELECT EXISTS (
         SELECT 1
         FROM app_auth.user_roles user_role
         JOIN app_auth.role_permissions role_permission
           ON role_permission.role_id = user_role.role_id
         JOIN app_auth.permissions permission
           ON permission.id = role_permission.permission_id
         WHERE user_role.user_id = $1 AND permission.code = $2
         UNION ALL
         SELECT 1
         FROM app_billing.premium_subscriptions subscription
         JOIN app_billing.premium_package_permissions package_permission
           ON package_permission.package_code = subscription.package_code
         JOIN app_auth.permissions premium_permission
           ON premium_permission.id = package_permission.permission_id
         WHERE subscription.user_id = $1
           AND subscription.status = 'ACTIVE'
           AND subscription.starts_at <= CURRENT_TIMESTAMP
           AND subscription.expires_at > CURRENT_TIMESTAMP
           AND premium_permission.code = $2
       ) AS granted`,
      [userId, permissionCode],
    );
    return result.rows[0]?.granted ?? false;
  }

  async getOrCreateWallet(userId: Uuid) {
    return this.database.transaction(async (client) => {
      await client.query(
        `INSERT INTO app_billing.wallets (user_id) VALUES ($1)
         ON CONFLICT (user_id) DO NOTHING`,
        [userId],
      );
      const result = await client.query<{ balance_vnd: string }>(
        'SELECT balance_vnd FROM app_billing.wallets WHERE user_id = $1',
        [userId],
      );
      return { balanceVnd: Number(result.rows[0]?.balance_vnd ?? 0) };
    });
  }

  async listTransactions(userId: Uuid, page: number, limit: number) {
    const result = await this.database.query<{
      id: string;
      transaction_type: string;
      direction: string;
      amount_vnd: string;
      balance_after_vnd: string;
      description: string;
      created_at: Date;
    }>(
      `SELECT id, transaction_type, direction, amount_vnd, balance_after_vnd,
              description, created_at FROM app_billing.wallet_transactions
       WHERE wallet_user_id = $1 ORDER BY created_at DESC LIMIT $2 OFFSET $3`,
      [userId, limit, (page - 1) * limit],
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

  async listOwnedOrders(userId: Uuid, page: number, limit: number) {
    const result = await this.database.query<
      PaymentOrderListItem & { total: string }
    >(
      `SELECT id, order_type AS type, premium_package AS "packageCode",
              amount_vnd AS "amountVnd", status, payment_code AS "paymentCode",
              created_at AS "createdAt", expires_at AS "expiresAt",
              paid_at AS "paidAt", COUNT(*) OVER() AS total
       FROM app_billing.payment_orders WHERE user_id = $1
       ORDER BY created_at DESC LIMIT $2 OFFSET $3`,
      [userId, limit, (page - 1) * limit],
    );
    return {
      items: result.rows.map(({ total: _total, ...row }) => ({
        ...row,
        amountVnd: Number(row.amountVnd),
      })),
      page,
      limit,
      total: Number(result.rows[0]?.total ?? 0),
    };
  }

  async listAdminOrders(page: number, limit: number, status?: string) {
    const values: unknown[] = [];
    const condition = status ? 'WHERE o.status = $1' : '';
    if (status) values.push(status);
    values.push(limit, (page - 1) * limit);
    const result = await this.database.query<
      AdminPaymentOrderListItem & { total: string }
    >(
      `SELECT o.id, o.user_id AS "userId", u.email AS "userEmail",
              o.order_type AS type, o.premium_package AS "packageCode",
              o.amount_vnd AS "amountVnd", o.status,
              o.payment_code AS "paymentCode", o.created_at AS "createdAt",
              o.expires_at AS "expiresAt", o.paid_at AS "paidAt",
              COALESCE(receipts.received_amount, 0)::bigint AS "receivedAmountVnd",
              o.sepay_transaction_id AS "providerReference",
              CASE
                WHEN COALESCE(receipts.received_amount, 0) = 0 THEN 'UNMATCHED'
                WHEN o.status = 'EXPIRED' AND receipts.last_received_at > o.expires_at THEN 'LATE'
                WHEN receipts.received_amount < o.amount_vnd THEN 'PARTIAL'
                WHEN receipts.received_amount > o.amount_vnd THEN 'OVERPAID'
                ELSE 'MATCHED'
              END AS "reconciliationStatus",
              COUNT(*) OVER() AS total
       FROM app_billing.payment_orders o
       JOIN app_auth.users u ON u.id = o.user_id
       LEFT JOIN LATERAL (
         SELECT SUM(e.amount_vnd) AS received_amount, MAX(e.received_at) AS last_received_at
         FROM app_billing.sepay_webhook_events e WHERE e.payment_code = o.payment_code
       ) receipts ON TRUE
       ${condition}
       ORDER BY o.created_at DESC LIMIT $${values.length - 1} OFFSET $${values.length}`,
      values,
    );
    return {
      items: result.rows.map(({ total: _total, ...row }) => ({
        ...row,
        amountVnd: Number(row.amountVnd),
        receivedAmountVnd: Number(row.receivedAmountVnd),
      })),
      page,
      limit,
      total: Number(result.rows[0]?.total ?? 0),
    };
  }

  async adminDashboardSummary() {
    const result = await this.database.query<{
      pending_orders: string;
      paid_orders_today: string;
      wallet_balance_total_vnd: string;
      active_premium_subscribers: string;
      failed_payment_notifications: string;
    }>(
      `SELECT
         (SELECT COUNT(*) FROM app_billing.payment_orders WHERE status = 'PENDING') AS pending_orders,
         (SELECT COUNT(*) FROM app_billing.payment_orders
           WHERE status = 'PAID' AND paid_at >= CURRENT_DATE
             AND paid_at < CURRENT_DATE + INTERVAL '1 day') AS paid_orders_today,
         (SELECT COALESCE(SUM(balance_vnd), 0) FROM app_billing.wallets) AS wallet_balance_total_vnd,
         (SELECT COUNT(DISTINCT user_id) FROM app_billing.premium_subscriptions
           WHERE status = 'ACTIVE' AND expires_at > CURRENT_TIMESTAMP) AS active_premium_subscribers,
         (SELECT COUNT(DISTINCT order_id) FROM app_billing.payment_notification_attempts WHERE status = 'FAILED') AS failed_payment_notifications`,
    );
    const row = result.rows[0];
    return {
      pendingOrders: Number(row.pending_orders),
      paidOrdersToday: Number(row.paid_orders_today),
      walletBalanceTotalVnd: Number(row.wallet_balance_total_vnd),
      activePremiumSubscribers: Number(row.active_premium_subscribers),
      failedPaymentNotifications: Number(row.failed_payment_notifications),
    };
  }

  async createSupportRequest(input: {
    userId: Uuid;
    orderId: string;
    subject: string;
    note: string;
  }) {
    const result = await this.database.query<{
      id: string;
      order_id: string;
      status: 'OPEN';
      created_at: Date;
    }>(
      `INSERT INTO app_billing.payment_support_requests (order_id, user_id, subject, note)
       SELECT id, user_id, $3, $4 FROM app_billing.payment_orders
       WHERE id = $1 AND user_id = $2
       RETURNING id, order_id, status, created_at`,
      [input.orderId, input.userId, input.subject, input.note],
    );
    const row = result.rows[0];
    return row
      ? {
          id: row.id,
          orderId: row.order_id,
          status: row.status,
          createdAt: row.created_at,
        }
      : null;
  }

  async cancelPendingOrder(userId: Uuid, orderId: string, reason: string) {
    const result = await this.database.query(
      `UPDATE app_billing.payment_orders
       SET status = 'CANCELLED', cancel_reason = $3, cancelled_at = CURRENT_TIMESTAMP
       WHERE id = $1 AND user_id = $2 AND status = 'PENDING' RETURNING id`,
      [orderId, userId, reason],
    );
    return result.rowCount === 1;
  }

  async findOwnedOrder(userId: Uuid, orderId: string) {
    const result = await this.database.query<PaymentOrderRecord>(
      `SELECT id, user_id, order_type, premium_package, premium_duration_days,
              amount_vnd, status, payment_code, expires_at
       FROM app_billing.payment_orders WHERE id = $1 AND user_id = $2`,
      [orderId, userId],
    );
    return result.rows[0] ?? null;
  }

  async refundPaidOrder(orderId: string, reason: string, adminEmail: string) {
    return this.database.transaction(async (client) => {
      const result = await client.query<PaymentOrderRecord>(
        `SELECT id, user_id, order_type, premium_package, premium_duration_days,
                amount_vnd, status, payment_code, expires_at
         FROM app_billing.payment_orders WHERE id = $1 FOR UPDATE`,
        [orderId],
      );
      const order = result.rows[0];
      if (!order) return 'NOT_FOUND' as const;
      if (order.status !== 'PAID') return 'NOT_PAID' as const;

      const adminId = await this.findAdminId(client, adminEmail);
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
        `Refund to customer: ${reason}`,
      );
      await this.insertLedger(
        client,
        order.user_id,
        order.id,
        'PREMIUM_REFUND',
        'CREDIT',
        amount,
        userBalance,
        `Internal refund: ${reason}`,
      );
      await client.query(
        `UPDATE app_billing.payment_orders SET status = 'REFUNDED',
           refunded_at = CURRENT_TIMESTAMP, cancel_reason = $2 WHERE id = $1`,
        [order.id, reason],
      );
      if (order.order_type === 'PREMIUM_PURCHASE') {
        await client.query(
          `UPDATE app_billing.premium_subscriptions SET status = 'REFUNDED'
           WHERE payment_order_id = $1`,
          [order.id],
        );
        await this.refreshEntitlement(client, order.user_id);
      }
      return 'REFUNDED' as const;
    });
  }

  async createOrder(input: {
    userId: Uuid;
    orderType: 'TOP_UP' | 'PREMIUM_PURCHASE';
    amountVnd: number;
    packageCode: string | null;
    durationDays: number | null;
    paymentCode: string;
    ttlMinutes: number;
  }) {
    const result = await this.database.query<PaymentOrderRecord>(
      `INSERT INTO app_billing.payment_orders
         (user_id, order_type, premium_package, premium_duration_days,
          amount_vnd, payment_code, expires_at)
       VALUES ($1, $2, $3, $4, $5, $6,
          CURRENT_TIMESTAMP + ($7::int * INTERVAL '1 minute'))
       RETURNING id, user_id, order_type, premium_package, premium_duration_days,
                 amount_vnd, status, payment_code, expires_at`,
      [
        input.userId,
        input.orderType,
        input.packageCode,
        input.durationDays,
        input.amountVnd,
        input.paymentCode,
        input.ttlMinutes,
      ],
    );
    return result.rows[0];
  }

  async applySePayPayment(input: {
    payload: SePayWebhookEvent;
    eventId: string;
    paymentCode: string | null;
    transferType: string;
    transferAmount: number;
    adminEmail: string;
  }): Promise<PaymentSucceededNotification | null> {
    return this.database.transaction(async (client) => {
      const event = await client.query(
        `INSERT INTO app_billing.sepay_webhook_events
           (sepay_transaction_id, payment_code, amount_vnd, gateway,
            transaction_date, account_number, sub_account, transfer_type,
            provider_code, content, description, reference_code,
            accumulated_vnd, raw_payload)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14::jsonb)
         ON CONFLICT (sepay_transaction_id) DO NOTHING
         RETURNING sepay_transaction_id`,
        [
          input.eventId,
          input.paymentCode,
          input.transferAmount,
          input.payload.gateway ?? null,
          input.payload.transactionDate ?? null,
          input.payload.accountNumber ?? null,
          input.payload.subAccount ?? null,
          input.transferType,
          input.payload.code ?? null,
          input.payload.content ?? null,
          input.payload.description ?? null,
          input.payload.referenceCode ?? null,
          input.payload.accumulated ?? null,
          JSON.stringify(input.payload),
        ],
      );
      if (!event.rowCount) return null;
      if (
        !['in', 'credit'].includes(input.transferType.toLowerCase()) ||
        !input.paymentCode
      ) {
        await client.query(
          `UPDATE app_billing.sepay_webhook_events
           SET processing_result = 'IGNORED'
           WHERE sepay_transaction_id = $1`,
          [input.eventId],
        );
        return null;
      }
      const selected = await client.query<PaymentOrderRecord>(
        `SELECT id, user_id, order_type, premium_package, premium_duration_days,
                amount_vnd, status, payment_code, expires_at
         FROM app_billing.payment_orders WHERE payment_code = $1 FOR UPDATE`,
        [input.paymentCode],
      );
      const order = selected.rows[0];
      if (
        !order ||
        order.status !== 'PENDING' ||
        order.expires_at <= new Date() ||
        Number(order.amount_vnd) !== input.transferAmount
      ) {
        await client.query(
          `UPDATE app_billing.sepay_webhook_events SET processing_result = 'IGNORED'
           WHERE sepay_transaction_id = $1`,
          [input.eventId],
        );
        return null;
      }
      await client.query(
        `UPDATE app_billing.payment_orders SET status = 'PAID', paid_at = CURRENT_TIMESTAMP,
           sepay_transaction_id = $2 WHERE id = $1`,
        [order.id, input.eventId],
      );
      const adminId = await this.findAdminId(client, input.adminEmail);
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
        const userBalance = await this.adjustWallet(
          client,
          order.user_id,
          -amount,
        );
        const saleBalance = await this.adjustWallet(client, adminId, amount);
        await this.insertLedger(
          client,
          order.user_id,
          order.id,
          'PREMIUM_PURCHASE',
          'DEBIT',
          amount,
          userBalance,
          `Premium package ${order.premium_package}`,
        );
        await this.insertLedger(
          client,
          adminId,
          order.id,
          'PREMIUM_SALE',
          'CREDIT',
          amount,
          saleBalance,
          `Premium sale ${order.payment_code}`,
        );
        await this.createSubscription(client, order);
      }
      await client.query(
        `UPDATE app_billing.sepay_webhook_events SET processing_result = 'APPLIED'
         WHERE sepay_transaction_id = $1`,
        [input.eventId],
      );
      return {
        userId: order.user_id,
        orderId: order.id,
        amountVnd: amount,
        orderType: order.order_type,
        packageCode: order.premium_package,
      };
    });
  }

  private async findAdminId(client: PoolClient, email: string) {
    const result = await client.query<{ id: string }>(
      `SELECT id FROM app_auth.users WHERE email = lower($1)
         AND status = 'ACTIVE' AND deleted_at IS NULL FOR UPDATE`,
      [email],
    );
    if (!result.rows[0]) throw new Error('PAYMENT_ADMIN_UNAVAILABLE');
    return result.rows[0].id;
  }

  private async lockWallets(client: PoolClient, userIds: string[]) {
    const ids = [...new Set(userIds)].sort();
    for (const id of ids)
      await client.query(
        `INSERT INTO app_billing.wallets (user_id) VALUES ($1) ON CONFLICT (user_id) DO NOTHING`,
        [id],
      );
    await client.query(
      'SELECT user_id FROM app_billing.wallets WHERE user_id = ANY($1::uuid[]) ORDER BY user_id FOR UPDATE',
      [ids],
    );
  }

  private async adjustWallet(
    client: PoolClient,
    userId: string,
    amount: number,
  ) {
    const result = await client.query<{ balance_vnd: string }>(
      `UPDATE app_billing.wallets SET balance_vnd = balance_vnd + $2
       WHERE user_id = $1 AND balance_vnd + $2 >= 0 RETURNING balance_vnd`,
      [userId, amount],
    );
    if (!result.rows[0]) throw new Error('WALLET_INSUFFICIENT_BALANCE');
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
      `INSERT INTO app_billing.wallet_transactions
         (wallet_user_id, payment_order_id, transaction_type, direction,
          amount_vnd, balance_after_vnd, description)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [userId, orderId, type, direction, amount, balance, description],
    );
  }

  private async createSubscription(
    client: PoolClient,
    order: PaymentOrderRecord,
  ) {
    const active = await client.query<{ expires_at: Date }>(
      `SELECT expires_at FROM app_billing.premium_subscriptions
       WHERE user_id = $1 AND status = 'ACTIVE' AND expires_at > CURRENT_TIMESTAMP
       ORDER BY expires_at DESC LIMIT 1 FOR UPDATE`,
      [order.user_id],
    );
    const startsAt = active.rows[0]?.expires_at ?? new Date();
    const expiresAt = new Date(startsAt);
    expiresAt.setUTCDate(
      expiresAt.getUTCDate() + Number(order.premium_duration_days),
    );
    await client.query(
      `INSERT INTO app_billing.premium_subscriptions
         (user_id, payment_order_id, package_code, starts_at, expires_at)
       VALUES ($1, $2, $3, $4::timestamptz, $5::timestamptz)`,
      [
        order.user_id,
        order.id,
        order.premium_package,
        new Date(startsAt).toISOString(),
        expiresAt.toISOString(),
      ],
    );
    await client.query(
      `INSERT INTO app_skin_analysis.user_analysis_entitlements
         (user_id, plan, daily_quota) VALUES ($1, 'PREMIUM', NULL)
       ON CONFLICT (user_id) DO UPDATE SET plan = 'PREMIUM', daily_quota = NULL,
         updated_at = CURRENT_TIMESTAMP`,
      [order.user_id],
    );
  }

  private async refreshEntitlement(client: PoolClient, userId: string) {
    const active = await client.query(
      `SELECT 1 FROM app_billing.premium_subscriptions
       WHERE user_id = $1 AND status = 'ACTIVE' AND expires_at > CURRENT_TIMESTAMP LIMIT 1`,
      [userId],
    );
    if (!active.rowCount)
      await client.query(
        `INSERT INTO app_skin_analysis.user_analysis_entitlements (user_id, plan)
         VALUES ($1, 'FREE') ON CONFLICT (user_id) DO UPDATE
         SET plan = 'FREE', daily_quota = NULL, updated_at = CURRENT_TIMESTAMP`,
        [userId],
      );
  }
}
