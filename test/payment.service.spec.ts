import { createHmac } from 'node:crypto';
import { HttpException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import type { PaymentDataPort } from '../src/modules/payment/application/ports/payment-data.port.js';
import type { PaymentGatewayPort } from '../src/modules/payment/application/ports/payment-gateway.port.js';
import {
  extractPaymentCode,
  PaymentService,
} from '../src/modules/payment/application/use-case/payment.service.js';

const secret = 'payment-test-secret';

function gateway(): PaymentGatewayPort {
  return {
    adminEmail: () => 'admin@example.com',
    orderTtlMinutes: () => 15,
    createQrImageUrl: () => 'https://example.test/qr.png',
    verifyWebhook: (rawBody, signature, timestamp) => {
      if (!rawBody || !signature || !timestamp || !/^\d+$/.test(timestamp))
        return 'INVALID';
      if (Math.abs(Date.now() / 1000 - Number(timestamp)) > 300)
        return 'EXPIRED';
      const expected = `sha256=${createHmac('sha256', secret)
        .update(`${timestamp}.${rawBody.toString('utf8')}`)
        .digest('hex')}`;
      return signature === expected ? 'VALID' : 'INVALID';
    },
  };
}

describe('PaymentService SePay authentication', () => {
  const service = new PaymentService(
    {} as PaymentDataPort,
    gateway(),
    {
      notifyPaymentSucceeded: async () => undefined,
    } as never,
    {
      record: async () => undefined,
      list: async () => ({ items: [], page: 1, limit: 20, total: 0 }),
    } as never,
  );
  const body = Buffer.from('{"id":123,"transferAmount":45000}');
  const timestamp = String(Math.floor(Date.now() / 1000));
  const signature = `sha256=${createHmac('sha256', secret)
    .update(`${timestamp}.${body.toString('utf8')}`)
    .digest('hex')}`;

  it('accepts a valid HMAC over the raw request body', () => {
    expect(() =>
      service.verifyWebhook(body, signature, timestamp),
    ).not.toThrow();
  });

  it('rejects tampered signatures and stale requests', () => {
    expect(() => service.verifyWebhook(body, 'sha256=bad', timestamp)).toThrow(
      'Invalid SePay webhook authentication.',
    );
    expect(() => service.verifyWebhook(body, signature, '1')).toThrow(
      'Expired SePay webhook timestamp.',
    );
  });
});

describe('extractPaymentCode', () => {
  it('uses the dedicated code when SePay provides one', () => {
    expect(
      extractPaymentCode({
        code: 'GS123ABC',
        content: 'unrelated',
        description: null,
      }),
    ).toBe('GS123ABC');
  });

  it('extracts the QR memo when code is null in a TPBank SePay event', () => {
    expect(
      extractPaymentCode({
        code: null,
        content: 'QR - VYE2F46E0AC26B',
        description: 'BankAPINotify QR - VYE2F46E0AC26B',
      }),
    ).toBe('VYE2F46E0AC26B');
  });
});

describe('PaymentService webhook notification', () => {
  it('notifies after the persistence port applies a new payment', async () => {
    const notification = {
      userId: 'user-1',
      orderId: 'order-1',
      amountVnd: 79_000,
      orderType: 'TOP_UP' as const,
      packageCode: null,
    };
    const applySePayPayment = vi.fn().mockResolvedValue(notification);
    const notifyPaymentSucceeded = vi.fn().mockResolvedValue(undefined);
    const service = new PaymentService(
      { applySePayPayment } as unknown as PaymentDataPort,
      gateway(),
      { notifyPaymentSucceeded } as never,
      {
        record: async () => undefined,
        list: async () => ({ items: [], page: 1, limit: 20, total: 0 }),
      } as never,
    );

    await expect(
      service.processWebhook({
        id: 43842569,
        code: null,
        content: 'QR - GSABC',
        description: null,
        transferType: 'in',
        transferAmount: 79_000,
      }),
    ).resolves.toEqual({ success: true });

    expect(applySePayPayment).toHaveBeenCalledWith({
      eventId: '43842569',
      paymentCode: 'GSABC',
      transferType: 'in',
      transferAmount: 79_000,
      adminEmail: 'admin@example.com',
    });
    expect(notifyPaymentSucceeded).toHaveBeenCalledWith(notification);
  });
});

describe('PaymentService website contracts', () => {
  const auditLog = {
    record: vi.fn().mockResolvedValue(undefined),
    list: vi
      .fn()
      .mockResolvedValue({ items: [], page: 1, limit: 20, total: 0 }),
  };

  it('returns active offers and caller-scoped subscription/order data', async () => {
    const findSubscription = vi.fn().mockResolvedValue({ isPremium: true });
    const listOwnedOrders = vi
      .fn()
      .mockResolvedValue({ items: [], page: 1, limit: 20, total: 0 });
    const data = {
      listActivePackages: vi
        .fn()
        .mockResolvedValue([{ code: 'PREMIUM_MONTHLY' }]),
      findSubscription,
      listOwnedOrders,
    } as unknown as PaymentDataPort;
    const service = new PaymentService(
      data,
      gateway(),
      {} as never,
      auditLog as never,
    );

    await expect(service.listActivePackages()).resolves.toEqual([
      { code: 'PREMIUM_MONTHLY' },
    ]);
    await expect(service.getSubscription('user-1')).resolves.toEqual({
      isPremium: true,
    });
    await expect(service.listOrders('user-1', 1, 20)).resolves.toMatchObject({
      total: 0,
    });
    expect(findSubscription).toHaveBeenCalledWith('user-1');
    expect(listOwnedOrders).toHaveBeenCalledWith('user-1', 1, 20);
  });

  it('creates support requests through the user-scoped persistence port', async () => {
    const createSupportRequest = vi.fn().mockResolvedValue({
      id: 'support-1',
      orderId: 'order-1',
      status: 'OPEN',
      createdAt: new Date(),
    });
    const service = new PaymentService(
      { createSupportRequest } as unknown as PaymentDataPort,
      gateway(),
      {} as never,
      auditLog as never,
    );
    await service.createSupportRequest(
      'user-1',
      'order-1',
      '  Help  ',
      '  Note  ',
    );
    expect(createSupportRequest).toHaveBeenCalledWith({
      userId: 'user-1',
      orderId: 'order-1',
      subject: 'Help',
      note: 'Note',
    });
  });

  it('audits refunds with their actor and reason', async () => {
    auditLog.record.mockClear();
    const service = new PaymentService(
      {
        refundPaidOrder: vi.fn().mockResolvedValue('REFUNDED'),
      } as unknown as PaymentDataPort,
      gateway(),
      {} as never,
      auditLog as never,
    );
    await service.refundOrder('order-1', ' Duplicate transfer ', 'admin-1');
    expect(auditLog.record).toHaveBeenCalledWith({
      actorUserId: 'admin-1',
      action: 'PAYMENT_ORDER_REFUNDED',
      resourceType: 'PAYMENT_ORDER',
      resourceId: 'order-1',
      metadata: { reason: 'Duplicate transfer' },
    });
  });

  it('treats a missing configured payment administrator as a server error', async () => {
    const service = new PaymentService(
      {
        refundPaidOrder: vi
          .fn()
          .mockRejectedValue(new Error('PAYMENT_ADMIN_UNAVAILABLE')),
      } as unknown as PaymentDataPort,
      gateway(),
      {} as never,
      auditLog as never,
    );

    const result = service.refundOrder('order-1', 'Reason', 'admin-1');

    await expect(result).rejects.not.toBeInstanceOf(HttpException);
    await expect(result).rejects.toThrow(
      'Configured payment administrator is unavailable.',
    );
  });
});
