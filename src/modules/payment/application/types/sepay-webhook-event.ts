export interface SePayWebhookEvent {
  id: string | number;
  transferType: string;
  transferAmount: number;
  gateway?: string | null;
  transactionDate?: string | null;
  accountNumber?: string | null;
  subAccount?: string | null;
  code?: string | null;
  content?: string | null;
  description?: string | null;
  accumulated?: number | null;
  referenceCode?: string | null;
}
