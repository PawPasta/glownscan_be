import { Injectable } from '@nestjs/common';
import { DatabaseService } from '../database/database.service.js';

@Injectable()
export class RateLimitService {
  constructor(private readonly database: DatabaseService) {}

  async consume(
    scope: string,
    subject: string,
    limit: number,
    windowSeconds: number,
  ): Promise<{ allowed: boolean; retryAfterSeconds: number }> {
    const now = new Date();
    const windowStart = new Date(
      Math.floor(now.getTime() / (windowSeconds * 1000)) * windowSeconds * 1000,
    );
    const retryAfterSeconds = Math.max(
      1,
      Math.ceil(
        (windowStart.getTime() + windowSeconds * 1000 - now.getTime()) / 1000,
      ),
    );
    const result = await this.database.query<{ request_count: number }>(
      `INSERT INTO app_security.rate_limit_windows
         (scope, subject, window_started_at, request_count)
       VALUES ($1, $2, $3::timestamptz, 1)
       ON CONFLICT (scope, subject, window_started_at) DO UPDATE
         SET request_count = app_security.rate_limit_windows.request_count + 1
         WHERE app_security.rate_limit_windows.request_count < $4
       RETURNING request_count`,
      [scope, subject, windowStart.toISOString(), limit],
    );
    return { allowed: result.rowCount === 1, retryAfterSeconds };
  }
}
