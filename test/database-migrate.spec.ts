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
    const cloudinary = migrations.find(({ version }) => Number(version) === 5);
    const skinAnalysis = migrations.find(
      ({ version }) => Number(version) === 8,
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
      1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16,
    ]);
    expect(migrations.map(({ name }) => name)).toEqual([
      'create_auth_schema',
      'create_auth_session_lifetime_schema',
      'seed_auth_reference_data',
      'create_api_rate_limits_schema',
      'create_app_cloudinary_upload_intents',
      'create_catalog_schema',
      'seed_demo_catalog_data',
      'create_skin_analysis_schema',
      'create_skin_assessment_schema',
      'create_skin_analysis_quotas',
      'create_wallet_and_payment_schema',
      'create_payment_support_and_audit_schema',
      'create_mobile_routine_and_notification_schema',
      'create_skin_analysis_consent_schema',
      'create_package_permission_entitlements',
      'expand_sepay_webhook_event_payload',
    ]);
    const skinAnalysis = migrations.find(
      ({ version }) => Number(version) === 8,
    );
    expect(skinAnalysis?.sql).toContain(
      "provider VARCHAR(30) NOT NULL DEFAULT 'GROQ'",
    );
    expect(skinAnalysis?.sql).toContain(
      "provider IN ('GROQ', 'OPENAI', 'GEMINI'",
    );
    const sessions = migrations.find(({ version }) => Number(version) === 2);
    expect(sessions?.sql).toContain('CREATE TABLE app_auth.auth_sessions');
    expect(sessions?.sql).toContain('absolute_expires_at');
    expect(sessions?.sql).not.toMatch(/ALTER\s+TABLE/i);
    expect(sessions?.sql).not.toContain('INSERT INTO');
    const rateLimits = migrations.find(({ version }) => Number(version) === 4);
    expect(rateLimits?.sql).toContain(
      'CREATE TABLE app_security.rate_limit_windows',
    );
    expect(rateLimits?.sql).not.toContain('app_skin_analysis');
    const quotas = migrations.find(({ version }) => Number(version) === 10);
    expect(quotas?.sql).toContain(
      'CREATE TABLE app_skin_analysis.user_analysis_entitlements',
    );
    expect(quotas?.sql).not.toContain('app_security');
    const mobile = migrations.find(({ version }) => Number(version) === 13);
    expect(mobile?.sql).toContain('CREATE TABLE app_routines.routines');
    expect(mobile?.sql).toContain('CREATE TABLE app_notifications.inbox');
    expect(mobile?.sql).toContain('CREATE TABLE app_auth.device_metadata');
    expect(mobile?.sql).not.toMatch(/ALTER\s+TABLE/i);
    expect(
      migrations.find(({ version }) => Number(version) === 11)?.sql,
    ).toContain('CREATE SCHEMA IF NOT EXISTS app_billing');
    expect(
      migrations.find(({ version }) => Number(version) === 11)?.sql,
    ).toContain('CREATE TABLE IF NOT EXISTS app_billing.premium_packages');
    const packageEntitlements = migrations.find(
      ({ version }) => Number(version) === 15,
    )?.sql;
    expect(packageEntitlements).toContain(
      'CREATE TABLE IF NOT EXISTS app_billing.premium_package_permissions',
    );
    expect(packageEntitlements).toContain("role.code = 'ADMIN'");
    expect(packageEntitlements).toContain("'RECOMMENDATION_READ'");
    expect(
      migrations.find(({ version }) => Number(version) === 9)?.sql,
    ).toContain(
      'CREATE TABLE IF NOT EXISTS app_skin_analysis.user_assessments',
    );
    expect(
      migrations.find(({ version }) => Number(version) === 6)?.sql,
    ).toContain('CREATE TABLE IF NOT EXISTS app_catalog.products');
    expect(
      migrations.find(({ version }) => Number(version) === 7)?.sql,
    ).toContain('generate_series(1, 100)');
    const websiteOperations = migrations.find(
      ({ version }) => Number(version) === 12,
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
      'DROP SCHEMA IF EXISTS app_notifications CASCADE',
    );
    expect(query).toHaveBeenCalledWith(
      'DROP SCHEMA IF EXISTS app_routines CASCADE',
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
