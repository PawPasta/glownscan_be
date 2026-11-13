import { describe, expect, it, vi } from 'vitest';
import { PostgresPaymentDataAdapter } from '../src/modules/payment/infrastructure/adapters/postgres-payment-data.adapter.js';
import type { DatabaseService } from '../src/shared/database/database.service.js';

describe('PostgresPaymentDataAdapter permissions', () => {
  it('checks role and active package grants, excluding expired subscriptions', async () => {
    const query = vi.fn().mockResolvedValue({ rows: [{ granted: true }] });
    const database = { query } as unknown as DatabaseService;
    const adapter = new PostgresPaymentDataAdapter(database);

    await expect(
      adapter.hasPermission('user-id', 'ROUTINE_MANAGE'),
    ).resolves.toBe(true);
    expect(query).toHaveBeenCalledWith(
      expect.stringContaining('app_billing.premium_package_permissions'),
      ['user-id', 'ROUTINE_MANAGE'],
    );
    expect(query.mock.calls[0][0]).toContain(
      'subscription.expires_at > CURRENT_TIMESTAMP',
    );
    expect(query.mock.calls[0][0]).toContain('app_auth.role_permissions');
  });
});
