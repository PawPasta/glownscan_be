import { describe, expect, it, vi } from 'vitest';
import type { DatabaseService } from '../src/shared/database/database.service.js';
import { FirebaseAccountConflictError } from '../src/modules/auth/application/ports/index.js';
import { PostgresAuthenticationAdapter } from '../src/modules/auth/infrastructure/adapters/postgres-authentication.adapter.js';

describe('PostgresAuthenticationAdapter Firebase account linking', () => {
  it('does not link a new Firebase UID to an existing password account by email alone', async () => {
    const query = vi
      .fn()
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [{ id: 'existing-password-user' }] });
    const database = {
      transaction: (work: (client: { query: typeof query }) => unknown) =>
        work({ query }),
    } as unknown as DatabaseService;
    const adapter = new PostgresAuthenticationAdapter(database);

    await expect(
      adapter.findOrCreateFirebaseUser({
        uid: 'new-provider-uid',
        email: 'verified@example.com',
        emailVerified: true,
        name: null,
        picture: null,
        signInProvider: 'google.com',
        providerData: {},
      }),
    ).rejects.toBeInstanceOf(FirebaseAccountConflictError);

    expect(query).toHaveBeenCalledTimes(2);
    expect(query.mock.calls[1]?.[0]).toContain('SELECT id FROM app_auth.users');
  });
});
