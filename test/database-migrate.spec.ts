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
    const cloudinary = migrations.find(({ version }) => Number(version) === 3);
    const skinAnalysis = migrations.find(
      ({ version }) => Number(version) === 4,
    );

    expect(cloudinary?.sql).toContain("purpose IN ('AVATAR', 'SKIN_ANALYSIS')");
    expect(skinAnalysis?.sql).toContain(
      'CREATE SCHEMA IF NOT EXISTS app_skin_analysis',
    );
    expect(skinAnalysis?.sql).not.toContain('app_skin_analysis.upload_intents');
  });

  it('creates Firebase auth and user profile support in V001', async () => {
    const migrations = await readMigrations();
    const auth = migrations.find(({ version }) => Number(version) === 1);

    expect(auth?.sql).toContain('password_hash TEXT,');
    expect(auth?.sql).toContain(
      'CREATE TABLE IF NOT EXISTS app_auth.user_providers',
    );
    expect(auth?.sql).toContain("'user_providers'");
    expect(auth?.sql).toContain('full_name VARCHAR(150)');
    expect(auth?.sql).toContain('avatar_url TEXT');
    expect(auth?.sql).toContain('date_of_birth DATE');
    expect(auth?.sql).toContain('gender VARCHAR(30)');
    expect(migrations.map(({ version }) => Number(version))).toEqual([
      1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11,
    ]);
    const mobile = migrations.find(({ version }) => Number(version) === 11);
    expect(mobile?.sql).toContain('CREATE TABLE app_routines.routines');
    expect(mobile?.sql).toContain('CREATE TABLE app_notifications.inbox');
    expect(mobile?.sql).toContain('CREATE TABLE app_auth.device_metadata');
    expect(mobile?.sql).not.toMatch(/ALTER\s+TABLE/i);
    expect(
      migrations.find(({ version }) => Number(version) === 6)?.sql,
    ).toContain('CREATE SCHEMA IF NOT EXISTS app_billing');
    expect(
      migrations.find(({ version }) => Number(version) === 6)?.sql,
    ).toContain('CREATE TABLE IF NOT EXISTS app_billing.premium_packages');
    expect(
      migrations.find(({ version }) => Number(version) === 7)?.sql,
    ).toContain(
      'CREATE TABLE IF NOT EXISTS app_skin_analysis.user_assessments',
    );
    expect(
      migrations.find(({ version }) => Number(version) === 8)?.sql,
    ).toContain('CREATE TABLE IF NOT EXISTS app_catalog.products');
    expect(
      migrations.find(({ version }) => Number(version) === 9)?.sql,
    ).toContain('generate_series(1, 100)');
    const websiteOperations = migrations.find(
      ({ version }) => Number(version) === 10,
    )?.sql;
    expect(websiteOperations).toContain(
      'CREATE TABLE IF NOT EXISTS app_billing.payment_support_requests',
    );
    expect(websiteOperations).toContain(
      'CREATE TABLE IF NOT EXISTS app_billing.admin_audit_logs',
    );
    expect(websiteOperations).toContain(
      'CREATE TABLE IF NOT EXISTS app_billing.payment_notification_attempts',
    );
    expect(
      migrations.some(({ sql }) =>
        sql.includes('CREATE SCHEMA IF NOT EXISTS app_profile'),
      ),
    ).toBe(false);
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
      'DROP SCHEMA IF EXISTS app_billing CASCADE',
    );
    expect(query).toHaveBeenCalledWith(
      'DROP SCHEMA IF EXISTS app_catalog CASCADE',
    );
    expect(query).toHaveBeenCalledWith(
      'DROP SCHEMA IF EXISTS app_security CASCADE',
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
