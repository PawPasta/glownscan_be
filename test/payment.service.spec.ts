import { createHmac } from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';
import {
  extractPaymentCode,
  PaymentService,
} from '../src/modules/payment/application/use-case/payment.service.js';

const secret = 'payment-test-secret';
const config = {
  get: (key: string, fallback?: string) =>
    key === 'GLOWNSCAN_PAYMENT_ORDER_TTL_MINUTES' ? fallback : undefined,
  getOrThrow: (key: string) =>
    ({
      GLOWNSCAN_SEPAY_WEBHOOK_SECRET: secret,
      GLOWNSCAN_BANK_BIN: '970423',
      GLOWNSCAN_BANK_ACCOUNT_NAME: 'Test Account',
      GLOWNSCAN_SEPAY_BANK_ACCOUNT_NUMBER: '0123456789',
      GLOWNSCAN_ADMIN_EMAIL: 'admin@example.com',
    })[key]!,
};

describe('PaymentService SePay authentication', () => {
  const service = new PaymentService(
    {} as never,
    config as never,
    { notifyPaymentSucceeded: async () => undefined } as never,
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
      'Invalid SePay webhook signature.',
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
  it('notifies exactly once after a new payment transaction commits', async () => {
    const client = {
      query: vi
        .fn()
        .mockResolvedValueOnce({ rowCount: 1, rows: [] })
        .mockResolvedValueOnce({
          rows: [
            {
              id: 'order-1',
              user_id: 'user-1',
              order_type: 'TOP_UP',
              premium_package: null,
              premium_duration_days: null,
              amount_vnd: '79000',
              status: 'PENDING',
              payment_code: 'GSABC',
              expires_at: new Date(Date.now() + 60_000),
            },
          ],
        })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [{ id: 'admin-1' }] })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [{ balance_vnd: '79000' }] })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [{ balance_vnd: '79000' }] })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [] }),
    };
    const notifyPaymentSucceeded = vi.fn().mockResolvedValue(undefined);
    const service = new PaymentService(
      {
        transaction: async (
          work: (transactionClient: typeof client) => unknown,
        ) => work(client),
      } as never,
      config as never,
      { notifyPaymentSucceeded } as never,
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

    expect(notifyPaymentSucceeded).toHaveBeenCalledWith({
      userId: 'user-1',
      orderId: 'order-1',
      amountVnd: 79_000,
      orderType: 'TOP_UP',
      packageCode: null,
    });
  });
});
