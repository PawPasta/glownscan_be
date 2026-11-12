export const PAYMENT_GATEWAY_PORT = Symbol('PAYMENT_GATEWAY_PORT');

export interface PaymentGatewayPort {
  adminEmail(): string;
  orderTtlMinutes(): number;
  createQrImageUrl(amountVnd: number, paymentCode: string): string;
  verifyWebhook(
    rawBody: Buffer | undefined,
    signature: string | undefined,
    timestamp: string | undefined,
  ): 'VALID' | 'INVALID' | 'EXPIRED';
}
