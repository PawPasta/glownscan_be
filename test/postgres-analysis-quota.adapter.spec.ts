import { describe, expect, it, vi } from 'vitest';
import { PostgresAnalysisQuotaAdapter } from '../src/modules/skin-analysis/infrastructure/adapters/postgres-analysis-quota.adapter.js';
import type { DatabaseService } from '../src/shared/database/database.service.js';

describe('PostgresAnalysisQuotaAdapter', () => {
  it('does not retain a stale Premium quota after the subscription expires', async () => {
    const query = vi.fn().mockImplementation((sql: string) => {
      if (sql.includes('SELECT count(*)'))
        return Promise.resolve({ rows: [{ count: '0' }] });
      if (sql.includes('SELECT EXISTS'))
        return Promise.resolve({ rows: [{ active: false }] });
      if (sql.includes('user_analysis_entitlements'))
        return Promise.resolve({
          rows: [{ plan: 'PREMIUM', daily_quota: null }],
        });
      if (sql.includes('daily_analysis_usage'))
        return Promise.resolve({ rows: [{ used_count: 3 }] });
      if (sql.includes('analysis_usage_reservations'))
        return Promise.resolve({ rows: [{ id: 'reservation-id' }] });
      return Promise.resolve({ rows: [] });
    });
    const database = {
      transaction: vi.fn((operation: (client: unknown) => unknown) =>
        operation({ query }),
      ),
    } as unknown as DatabaseService;
    const config = {
      get: vi.fn((_name: string, fallback: string) => fallback),
    };
    const adapter = new PostgresAnalysisQuotaAdapter(database, config as never);

    await expect(adapter.reserveAnalysis('free-user-id')).resolves.toBeNull();
    expect(query).toHaveBeenCalledWith(
      expect.stringContaining('FROM app_billing.premium_subscriptions'),
      ['free-user-id'],
    );
  });
});
