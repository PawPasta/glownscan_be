import { compare } from 'bcryptjs';
import { describe, expect, it, vi } from 'vitest';
import {
  DEVELOPMENT_ADMIN_EMAIL,
  DEVELOPMENT_ADMIN_PASSWORD,
  seedDevelopmentAdmin,
} from '../database/seed-development-admin.js';

describe('development admin seed', () => {
  it('creates the default admin only through the non-production reset flow', async () => {
    const query = vi
      .fn()
      .mockResolvedValueOnce({ rows: [], rowCount: null })
      .mockResolvedValueOnce({ rows: [{ id: 1 }] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [{ id: 'admin-user-id' }] })
      .mockResolvedValue({ rows: [], rowCount: 1 });

    await expect(seedDevelopmentAdmin({ query }, 'development')).resolves.toBe(
      true,
    );

    expect(query.mock.calls[0]?.[0]).toBe('BEGIN');
    expect(query.mock.calls[1]?.[0]).toContain("code = 'ADMIN'");
    expect(query.mock.calls[2]?.[1]).toEqual([DEVELOPMENT_ADMIN_EMAIL]);
    const insertUser = query.mock.calls[3]?.[1] as [string, string];
    expect(insertUser[0]).toBe(DEVELOPMENT_ADMIN_EMAIL);
    await expect(
      compare(DEVELOPMENT_ADMIN_PASSWORD, insertUser[1]),
    ).resolves.toBe(true);
    expect(query.mock.calls[4]?.[1]).toEqual(['admin-user-id', 1]);
    expect(query.mock.calls.at(-1)?.[0]).toBe('COMMIT');
  });

  it('never seeds a default credential in production', async () => {
    const query = vi.fn();

    await expect(seedDevelopmentAdmin({ query }, 'production')).resolves.toBe(
      false,
    );
    expect(query).not.toHaveBeenCalled();
  });

  it('does not reset the password or roles when the default email already exists', async () => {
    const query = vi
      .fn()
      .mockResolvedValueOnce({ rows: [], rowCount: null })
      .mockResolvedValueOnce({ rows: [{ id: 1 }] })
      .mockResolvedValueOnce({ rows: [{ id: 'existing-user' }] })
      .mockResolvedValue({ rows: [], rowCount: 1 });

    await expect(seedDevelopmentAdmin({ query }, 'development')).resolves.toBe(
      false,
    );
    expect(query).toHaveBeenCalledTimes(4);
    expect(query.mock.calls[3]?.[0]).toBe('COMMIT');
  });
});
