import { Injectable } from '@nestjs/common';
import { DatabaseService } from '../../../../shared/database/database.service.js';
import type {
  NotificationDataPort,
  NotificationPreferences,
} from '../../application/ports/notification-data.port.js';

@Injectable()
export class PostgresNotificationDataAdapter implements NotificationDataPort {
  constructor(private readonly database: DatabaseService) {}
  async getPreferences(userId: string): Promise<NotificationPreferences> {
    await this.database.query(
      `INSERT INTO app_notifications.user_preferences (user_id) VALUES ($1) ON CONFLICT (user_id) DO NOTHING`,
      [userId],
    );
    const result = await this.database.query<
      Omit<NotificationPreferences, 'updatedAt'> & { updatedAt: Date }
    >(
      `SELECT routine_reminders AS "routineReminders", analysis_updates AS "analysisUpdates", product_recommendations AS "productRecommendations", marketing, to_char(reminder_time, 'HH24:MI') AS "reminderTime", timezone, updated_at AS "updatedAt" FROM app_notifications.user_preferences WHERE user_id = $1`,
      [userId],
    );
    return {
      ...result.rows[0],
      updatedAt: new Date(result.rows[0].updatedAt).toISOString(),
    };
  }
  async updatePreferences(
    userId: string,
    input: Partial<NotificationPreferences>,
  ) {
    const columns: Record<string, string> = {
      routineReminders: 'routine_reminders',
      analysisUpdates: 'analysis_updates',
      productRecommendations: 'product_recommendations',
      marketing: 'marketing',
      reminderTime: 'reminder_time',
      timezone: 'timezone',
    };
    const keys = Object.keys(columns).filter((key) =>
      Object.hasOwn(input, key),
    );
    await this.database.query(
      `INSERT INTO app_notifications.user_preferences (user_id) VALUES ($1) ON CONFLICT (user_id) DO NOTHING`,
      [userId],
    );
    if (keys.length) {
      const values: unknown[] = [userId];
      const sets = keys.map((key) => {
        values.push(input[key as keyof NotificationPreferences]);
        return `${columns[key]} = $${values.length}`;
      });
      await this.database.query(
        `UPDATE app_notifications.user_preferences SET ${sets.join(', ')}, updated_at = CURRENT_TIMESTAMP WHERE user_id = $1`,
        values,
      );
    }
    return this.getPreferences(userId);
  }
  async list(userId: string, page: number, limit: number) {
    const [rows, count] = await Promise.all([
      this.database.query(
        `SELECT id, type, title, body, payload, read_at AS "readAt", created_at AS "createdAt" FROM app_notifications.inbox WHERE user_id = $1 ORDER BY created_at DESC LIMIT $2 OFFSET $3`,
        [userId, limit, (page - 1) * limit],
      ),
      this.database.query<{ total: string }>(
        `SELECT count(*) AS total FROM app_notifications.inbox WHERE user_id = $1`,
        [userId],
      ),
    ]);
    return { items: rows.rows, total: Number(count.rows[0].total) };
  }
  async markRead(userId: string, id: string) {
    const result = await this.database.query(
      `UPDATE app_notifications.inbox SET read_at = COALESCE(read_at, CURRENT_TIMESTAMP) WHERE user_id = $1 AND id = $2`,
      [userId, id],
    );
    return result.rowCount === 1;
  }
  async markAllRead(userId: string) {
    const result = await this.database.query(
      `UPDATE app_notifications.inbox SET read_at = CURRENT_TIMESTAMP WHERE user_id = $1 AND read_at IS NULL`,
      [userId],
    );
    return result.rowCount ?? 0;
  }
  async createPaymentInbox(
    userId: string,
    title: string,
    body: string,
    payload: Record<string, string>,
  ) {
    await this.database.query(
      `INSERT INTO app_notifications.inbox (user_id, type, title, body, payload) VALUES ($1, 'PAYMENT_SUCCEEDED', $2, $3, $4::jsonb)`,
      [userId, title, body, JSON.stringify(payload)],
    );
  }

  async createAnalysisFailureInbox(userId: string, sessionId: string) {
    await this.database.query(
      `INSERT INTO app_notifications.inbox (user_id, type, title, body, payload)
       VALUES ($1, 'ANALYSIS_FAILED', 'Skin analysis could not be completed',
         'After three attempts, the uploaded photo and analysis data were deleted. Please upload a new photo to try again.', $2::jsonb)`,
      [userId, JSON.stringify({ sessionId, action: 'UPLOAD_AGAIN' })],
    );
  }
}
