import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Client } from 'pg';
import {
  readMigrations,
  resetApplicationSchemas,
} from '../database/migrate.js';

describe('database migrations', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('stores Cloudinary intents in the shared migration, not the skin schema', async () => {
    const migrations = await readMigrations();
    const cloudinary = migrations.find(({ version }) => Number(version) === 4);
    const skinAnalysis = migrations.find(
      ({ version }) => Number(version) === 5,
    );

    expect(cloudinary?.sql).toContain("purpose IN ('AVATAR', 'SKIN_ANALYSIS')");
    expect(skinAnalysis?.sql).not.toContain('app_skin_analysis.upload_intents');
  });

  it('creates Firebase auth support in V001 without a separate V006 migration', async () => {
    const migrations = await readMigrations();
    const auth = migrations.find(({ version }) => Number(version) === 1);

    expect(auth?.sql).toContain('password_hash TEXT,');
    expect(auth?.sql).toContain(
      'CREATE TABLE IF NOT EXISTS app_auth.user_providers',
    );
    expect(auth?.sql).toContain("'user_providers'");
    expect(migrations.map(({ version }) => Number(version))).toEqual([
      1, 2, 3, 4, 5,
    ]);
  });

  it('drops only application schemas and migration history', async () => {
    const query = vi
      .fn()
      .mockResolvedValue({ rows: [{ database_name: 'glownscan_test' }] });
    const client = { query } as unknown as Client;

    await resetApplicationSchemas(client);

    expect(query).toHaveBeenCalledWith(
      'SELECT current_database() AS database_name',
    );
    expect(query).toHaveBeenCalledWith(
      'DROP SCHEMA IF EXISTS app_skin_analysis CASCADE',
    );
    expect(query).toHaveBeenCalledWith(
      'DROP SCHEMA IF EXISTS app_cloudinary CASCADE',
    );
    expect(query).toHaveBeenCalledWith(
      'DROP SCHEMA IF EXISTS app_profile CASCADE',
    );
    expect(query).toHaveBeenCalledWith(
      'DROP SCHEMA IF EXISTS app_auth CASCADE',
    );
    expect(query).toHaveBeenCalledWith(
      'DROP TABLE IF EXISTS public.schema_migrations',
    );
    expect(query).toHaveBeenCalledWith('COMMIT');
  });
});
