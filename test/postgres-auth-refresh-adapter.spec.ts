import { describe, expect, it, vi } from 'vitest';
import type { DatabaseService } from '../src/shared/database/database.service.js';
import { RefreshTokenAlreadyRotatedError } from '../src/modules/auth/application/ports/index.js';
import { PostgresAuthenticationAdapter } from '../src/modules/auth/infrastructure/adapters/postgres-authentication.adapter.js';

describe('PostgresAuthenticationAdapter refresh-family policy', () => {
  it('persists session expiry instants as ISO strings with explicit timestamptz casts', async () => {
    const query = vi
      .fn()
      .mockResolvedValueOnce({ rowCount: 1, rows: [] })
      .mockResolvedValueOnce({ rows: [{ id: 'device-id' }] })
      .mockResolvedValue({ rowCount: 1, rows: [] });
    const adapter = createAdapter(query);
    const idleExpiresAt = new Date('2026-11-17T18:00:00.000Z');
    const absoluteExpiresAt = new Date('2026-12-17T18:00:00.000Z');

    await adapter.createRefreshSession({
      userId: 'user-id',
      deviceUuid: 'installation-id',
      platform: 'WEBSITE',
      familyId: 'family-id',
      tokenHash: 'token-hash',
      expiresAt: idleExpiresAt,
      absoluteExpiresAt,
      ipAddress: null,
      userAgent: null,
    });

    expect(query.mock.calls[2]?.[0]).toContain(
      'LEAST($4::timestamptz, $5::timestamptz)',
    );
    expect(query.mock.calls[2]?.[1]).toEqual([
      'family-id',
      'user-id',
      'device-id',
      idleExpiresAt.toISOString(),
      absoluteExpiresAt.toISOString(),
      null,
      null,
    ]);
    expect(query.mock.calls[3]?.[0]).toContain('$5::timestamptz');
    expect(query.mock.calls[3]?.[1]?.[4]).toBe(idleExpiresAt.toISOString());
  });

  it('does not revoke a winning session for a duplicate refresh within the race window', async () => {
    const query = vi.fn().mockResolvedValueOnce({
      rows: [
        refreshRow({
          revoked_at: new Date(),
          revoke_reason: 'ROTATED',
          successor_created_at: new Date(),
        }),
      ],
    });
    const adapter = createAdapter(query);

    const result = adapter.rotateRefreshToken(
      'old-hash',
      'new-hash',
      new Date(Date.now() + 30 * 86_400_000),
      'user-id',
    );

    await expect(result).rejects.toBeInstanceOf(
      RefreshTokenAlreadyRotatedError,
    );
    expect(query).toHaveBeenCalledTimes(1);
  });

  it('revokes the family when a rotated token is replayed outside the race window', async () => {
    const query = vi
      .fn()
      .mockResolvedValueOnce({
        rows: [
          refreshRow({
            revoked_at: new Date(Date.now() - 10_000),
            revoke_reason: 'ROTATED',
            successor_created_at: new Date(Date.now() - 10_000),
          }),
        ],
      })
      .mockResolvedValue({ rowCount: 1, rows: [] });
    const adapter = createAdapter(query);

    const result = await adapter.rotateRefreshToken(
      'old-hash',
      'new-hash',
      new Date(Date.now() + 30 * 86_400_000),
      'user-id',
    );

    expect(result).toBeNull();
    expect(query).toHaveBeenCalledTimes(3);
    expect(query.mock.calls[1]?.[0]).toContain(
      'UPDATE app_auth.refresh_tokens',
    );
    expect(query.mock.calls[2]?.[0]).toContain('UPDATE app_auth.auth_sessions');
  });

  it('revokes an active family when its absolute lifetime has elapsed', async () => {
    const query = vi
      .fn()
      .mockResolvedValueOnce({
        rows: [
          refreshRow({
            absolute_expires_at: new Date(Date.now() - 1_000),
          }),
        ],
      })
      .mockResolvedValue({ rowCount: 1, rows: [] });
    const adapter = createAdapter(query);

    const result = await adapter.rotateRefreshToken(
      'old-hash',
      'new-hash',
      new Date(Date.now() + 30 * 86_400_000),
      'user-id',
    );

    expect(result).toBeNull();
    expect(query).toHaveBeenCalledTimes(3);
    expect(query.mock.calls[1]?.[1]).toEqual(['family-id', 'ABSOLUTE_EXPIRED']);
  });
});

function createAdapter(query: ReturnType<typeof vi.fn>) {
  const database = {
    transaction: (work: (client: { query: typeof query }) => unknown) =>
      work({ query }),
  } as unknown as DatabaseService;
  return new PostgresAuthenticationAdapter(database);
}

function refreshRow(overrides: Record<string, unknown> = {}) {
  const expiry = new Date(Date.now() + 60_000);
  return {
    id: 'token-id',
    user_id: 'user-id',
    device_id: 'device-id',
    token_family_id: 'family-id',
    expires_at: expiry,
    revoked_at: null,
    revoke_reason: null,
    successor_created_at: null,
    session_revoked_at: null,
    idle_expires_at: expiry,
    absolute_expires_at: new Date(Date.now() + 90 * 86_400_000),
    ...overrides,
  };
}
