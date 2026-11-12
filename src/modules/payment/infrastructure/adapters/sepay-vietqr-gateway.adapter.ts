import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHmac, timingSafeEqual } from 'node:crypto';
import { VietQR } from 'vietqr';
import type { PaymentGatewayPort } from '../../application/ports/payment-gateway.port.js';

@Injectable()
export class SePayVietQrGatewayAdapter implements PaymentGatewayPort {
  private readonly qr = new VietQR();

  constructor(private readonly config: ConfigService) {}

  adminEmail() {
    return (
      this.config.get<string>('GLOWNSCAN_ADMIN_EMAI')?.trim() ||
      this.config.getOrThrow<string>('GLOWNSCAN_ADMIN_EMAIL').trim()
    ).toLowerCase();
  }

  orderTtlMinutes() {
    return Number(
      this.config.get<string>('GLOWNSCAN_PAYMENT_ORDER_TTL_MINUTES', '15'),
    );
  }

  createQrImageUrl(amountVnd: number, paymentCode: string) {
    return this.qr.genQuickLink({
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
    });
  }

  verifyWebhook(
    rawBody: Buffer | undefined,
    signature: string | undefined,
    timestamp: string | undefined,
  ) {
    if (!rawBody || !signature || !timestamp || !/^\d+$/.test(timestamp))
      return 'INVALID' as const;
    if (Math.abs(Date.now() / 1000 - Number(timestamp)) > 300)
      return 'EXPIRED' as const;
    const expected = `sha256=${createHmac(
      'sha256',
      this.config.getOrThrow<string>('GLOWNSCAN_SEPAY_WEBHOOK_SECRET'),
    )
      .update(`${timestamp}.${rawBody.toString('utf8')}`)
      .digest('hex')}`;
    const receivedBuffer = Buffer.from(signature);
    const expectedBuffer = Buffer.from(expected);
    if (
      receivedBuffer.length !== expectedBuffer.length ||
      !timingSafeEqual(receivedBuffer, expectedBuffer)
    )
      return 'INVALID' as const;
    return 'VALID' as const;
  }
}
