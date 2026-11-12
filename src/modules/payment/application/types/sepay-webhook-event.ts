export interface SePayWebhookEvent {
  id: string | number;
  transferType: string;
  transferAmount: number;
  code?: string | null;
  content?: string | null;
  description?: string | null;
}
