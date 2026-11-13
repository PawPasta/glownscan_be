import { Inject, Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import {
  BadRequestException,
  ConflictException,
  NotFoundException,
  UnauthorizedException,
} from '../../../../shared/handler/http.exceptions.js';
import type { Uuid } from '../../../../shared/types/domain.types.js';
import { AuditLogService } from '../../../audit/application/use-case/audit-log.service.js';
import { NotificationService } from '../../../notification/application/use-case/notification.service.js';
import type { PremiumPackageCode } from '../../domain/entities/premium-package.entity.js';
import type { SePayWebhookEvent } from '../types/sepay-webhook-event.js';
import {
  PAYMENT_DATA_PORT,
  type PaymentDataPort,
} from '../ports/payment-data.port.js';
import {
  PAYMENT_GATEWAY_PORT,
  type PaymentGatewayPort,
} from '../ports/payment-gateway.port.js';

@Injectable()
export class PaymentService {
  constructor(
    @Inject(PAYMENT_DATA_PORT) private readonly paymentData: PaymentDataPort,
    @Inject(PAYMENT_GATEWAY_PORT) private readonly gateway: PaymentGatewayPort,
    private readonly notifications: NotificationService,
    private readonly auditLog: AuditLogService,
  ) {}

  listActivePackages() {
    return this.paymentData.listActivePackages();
  }

  getSubscription(userId: Uuid) {
    return this.paymentData.findSubscription(userId);
  }

  hasPermission(userId: Uuid, permissionCode: string): Promise<boolean> {
    return this.paymentData.hasPermission(userId, permissionCode);
  }

  createTopUp(userId: Uuid, amountVnd: number) {
    return this.createOrder(userId, 'TOP_UP', amountVnd, null, null);
  }

  async createPremiumCheckout(userId: Uuid, packageCode: PremiumPackageCode) {
    const premiumPackage =
      await this.paymentData.findActivePackage(packageCode);
    if (!premiumPackage)
      throw new NotFoundException(
        'Premium package was not found or is inactive.',
      );
    return this.createOrder(
      userId,
      'PREMIUM_PURCHASE',
      premiumPackage.amountVnd,
      premiumPackage.code,
      premiumPackage.durationDays,
    );
  }

  getWallet(userId: Uuid) {
    return this.paymentData.getOrCreateWallet(userId);
  }

  listTransactions(userId: Uuid, page: number, limit: number) {
    return this.paymentData.listTransactions(userId, page, limit);
  }

  listOrders(userId: Uuid, page: number, limit: number) {
    return this.paymentData.listOwnedOrders(userId, page, limit);
  }

  listAdminOrders(page: number, limit: number, status?: string) {
    return this.paymentData.listAdminOrders(page, limit, status);
  }

  adminDashboardSummary() {
    return this.paymentData.adminDashboardSummary();
  }

  listAuditLogs(page: number, limit: number) {
    return this.auditLog.list(page, limit);
  }

  async createSupportRequest(
    userId: Uuid,
    orderId: string,
    subject: string,
    note: string,
  ) {
    const normalizedSubject = subject.trim();
    const normalizedNote = note.trim();
    if (
      !normalizedSubject ||
      normalizedSubject.length > 150 ||
      !normalizedNote ||
      normalizedNote.length > 2000
    )
      throw new BadRequestException('Support request fields are invalid.');
    const support = await this.paymentData.createSupportRequest({
      userId,
      orderId,
      subject: normalizedSubject,
      note: normalizedNote,
    });
    if (!support) throw new NotFoundException('Payment order was not found.');
    return support;
  }

  async cancelOrder(userId: Uuid, orderId: string, reason: string) {
    const cancelled = await this.paymentData.cancelPendingOrder(
      userId,
      orderId,
      normalizeReason(reason),
    );
    if (!cancelled)
      throw new ConflictException(
        'Only your pending payment order can be cancelled.',
      );
    return { id: orderId, status: 'CANCELLED' };
  }

  async getOrder(userId: Uuid, orderId: string) {
    const order = await this.paymentData.findOwnedOrder(userId, orderId);
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

  async refundOrder(orderId: string, reason: string, actorUserId: Uuid) {
    let result: 'REFUNDED' | 'NOT_FOUND' | 'NOT_PAID';
    try {
      result = await this.paymentData.refundPaidOrder(
        orderId,
        normalizeReason(reason),
        this.gateway.adminEmail(),
      );
    } catch (error) {
      this.mapPersistenceError(error);
    }
    if (result === 'NOT_FOUND')
      throw new NotFoundException('Payment order was not found.');
    if (result === 'NOT_PAID')
      throw new ConflictException('Only paid orders can be refunded.');
    await this.auditLog.record({
      actorUserId,
      action: 'PAYMENT_ORDER_REFUNDED',
      resourceType: 'PAYMENT_ORDER',
      resourceId: orderId,
      metadata: { reason: normalizeReason(reason) },
    });
    return { id: orderId, status: 'REFUNDED' };
  }

  verifyWebhook(
    rawBody: Buffer | undefined,
    signature: string | undefined,
    timestamp: string | undefined,
  ) {
    const result = this.gateway.verifyWebhook(rawBody, signature, timestamp);
    if (result === 'EXPIRED')
      throw new UnauthorizedException('Expired SePay webhook timestamp.');
    if (result !== 'VALID')
      throw new UnauthorizedException('Invalid SePay webhook authentication.');
  }

  async processWebhook(payload: SePayWebhookEvent) {
    const paymentCode = extractPaymentCode(payload);
    if (!paymentCode)
      throw new BadRequestException(
        'SePay webhook does not contain a payment code.',
      );
    try {
      const notification = await this.paymentData.applySePayPayment({
        eventId: String(payload.id),
        paymentCode,
        transferType: payload.transferType,
        transferAmount: payload.transferAmount,
        adminEmail: this.gateway.adminEmail(),
      });
      if (notification)
        await this.notifications.notifyPaymentSucceeded(notification);
    } catch (error) {
      this.mapPersistenceError(error);
    }
    return { success: true };
  }

  private async createOrder(
    userId: Uuid,
    orderType: 'TOP_UP' | 'PREMIUM_PURCHASE',
    amountVnd: number,
    packageCode: string | null,
    durationDays: number | null,
  ) {
    const paymentCode = `GS${randomUUID().replaceAll('-', '').slice(0, 20).toUpperCase()}`;
    const order = await this.paymentData.createOrder({
      userId,
      orderType,
      amountVnd,
      packageCode,
      durationDays,
      paymentCode,
      ttlMinutes: this.gateway.orderTtlMinutes(),
    });
    return {
      id: order.id,
      type: order.order_type,
      amountVnd,
      paymentCode,
      expiresAt: order.expires_at,
      qrImageUrl: this.gateway.createQrImageUrl(amountVnd, paymentCode),
    };
  }

  private mapPersistenceError(error: unknown): never {
    if (error instanceof Error && error.message === 'PAYMENT_ADMIN_UNAVAILABLE')
      throw new ConflictException(
        'Configured payment administrator is unavailable.',
      );
    if (
      error instanceof Error &&
      error.message === 'WALLET_INSUFFICIENT_BALANCE'
    )
      throw new ConflictException('Wallet does not have enough balance.');
    throw error;
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
  payload: Pick<SePayWebhookEvent, 'code' | 'content' | 'description'>,
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
