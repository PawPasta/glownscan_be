export const NOTIFICATION_DATA_PORT = Symbol('NOTIFICATION_DATA_PORT');
export interface NotificationPreferences {
  routineReminders: boolean;
  analysisUpdates: boolean;
  productRecommendations: boolean;
  marketing: boolean;
  reminderTime: string;
  timezone: string;
  updatedAt: string;
}
export interface NotificationDataPort {
  getPreferences(userId: string): Promise<NotificationPreferences>;
  updatePreferences(
    userId: string,
    input: Partial<NotificationPreferences>,
  ): Promise<NotificationPreferences>;
  list(
    userId: string,
    page: number,
    limit: number,
  ): Promise<{ items: unknown[]; total: number }>;
  markRead(userId: string, notificationId: string): Promise<boolean>;
  markAllRead(userId: string): Promise<number>;
  createPaymentInbox(
    userId: string,
    title: string,
    body: string,
    payload: Record<string, string>,
  ): Promise<void>;
}
