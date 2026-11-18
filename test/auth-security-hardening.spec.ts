import { describe, expect, it, vi } from 'vitest';
import type { ConfigService } from '@nestjs/config';
import type { JwtService } from '@nestjs/jwt';
import { validateEnvironment } from '../src/shared/config/environment.validation.js';
import { JwtTokenRuntimeAdapter } from '../src/modules/auth/infrastructure/adapters/jwt-token-runtime.adapter.js';
import { AuthController } from '../src/modules/auth/presentation/auth.controller.js';
import { RATE_LIMIT_OPTIONS } from '../src/shared/rate-limit/rate-limit.decorator.js';

const firebaseMocks = vi.hoisted(() => ({ verifyIdToken: vi.fn() }));

vi.mock('firebase-admin/app', () => ({
  getApps: () => [],
  initializeApp: (options: Record<string, unknown>, name: string) => ({
    name,
    options,
  }),
}));

vi.mock('firebase-admin/auth', () => ({
  FirebaseAuthError: class FirebaseAuthError extends Error {
    code = 'auth/id-token-revoked';
  },
  getAuth: () => ({ verifyIdToken: firebaseMocks.verifyIdToken }),
}));

describe('authentication runtime hardening', () => {
  it('requires the absolute session lifetime to be at least the idle lifetime', () => {
    expect(
      () =>
        new JwtTokenRuntimeAdapter(
          {} as JwtService,
          config({
            GLOWNSCAN_REFRESH_TOKEN_TTL_DAYS: '30',
            GLOWNSCAN_REFRESH_SESSION_ABSOLUTE_TTL_DAYS: '14',
          }),
        ),
    ).toThrow('JWT and refresh token expiration settings are invalid.');

    expect(() =>
      validateEnvironment({
        ...requiredEnvironment(),
        GLOWNSCAN_REFRESH_TOKEN_TTL_DAYS: '30',
        GLOWNSCAN_REFRESH_SESSION_ABSOLUTE_TTL_DAYS: '14',
      }),
    ).toThrow(
      'GLOWNSCAN_REFRESH_SESSION_ABSOLUTE_TTL_DAYS must be greater than or equal to GLOWNSCAN_REFRESH_TOKEN_TTL_DAYS.',
    );
  });

  it('keeps the configured absolute lifetime exposed to session creation', () => {
    const adapter = new JwtTokenRuntimeAdapter(
      {} as JwtService,
      config({ GLOWNSCAN_REFRESH_SESSION_ABSOLUTE_TTL_DAYS: '120' }),
    );
    expect(adapter.refreshTokenTtlDays).toBe(30);
    expect(adapter.refreshSessionAbsoluteTtlDays).toBe(120);
  });

  it('asks Firebase Admin to check token revocation', async () => {
    firebaseMocks.verifyIdToken.mockResolvedValue({
      uid: 'firebase-user',
      email: 'user@example.com',
      email_verified: true,
      firebase: { sign_in_provider: 'google.com', identities: {} },
      iss: 'issuer',
      aud: 'project',
      auth_time: 1,
      sub: 'firebase-user',
      iat: 1,
      exp: 2,
    });
    const { FirebaseIdTokenVerifier } =
      await import('../src/modules/auth/infrastructure/adapters/firebase-id-token.verifier.js');
    const verifier = new FirebaseIdTokenVerifier(config({}));

    await verifier.verifyIdToken('firebase-id-token');

    expect(firebaseMocks.verifyIdToken).toHaveBeenCalledWith(
      'firebase-id-token',
      true,
    );
  });

  it('assigns dedicated rate-limit scopes to verification and refresh endpoints', () => {
    const scopes = [
      ['verifyEmail', 'auth-verify-email'],
      ['checkEmailVerification', 'auth-verify-email-check'],
      ['refresh', 'auth-refresh'],
      ['logout', 'auth-logout'],
      ['checkPasswordReset', 'auth-password-reset-check'],
      ['resetPassword', 'auth-password-reset-confirm'],
    ] as const;

    for (const [methodName, scope] of scopes) {
      const handler = Object.getOwnPropertyDescriptor(
        AuthController.prototype,
        methodName,
      )?.value;
      expect(Reflect.getMetadata(RATE_LIMIT_OPTIONS, handler)).toMatchObject({
        scope,
        key: 'IP',
      });
    }
  });
});

function config(overrides: Record<string, string>): ConfigService {
  const values = {
    GLOWNSCAN_FIREBASE_PROJECT_ID: 'glownscan-test',
    GLOWNSCAN_ACCESS_TOKEN_TTL_SECONDS: '900',
    GLOWNSCAN_REFRESH_TOKEN_TTL_DAYS: '30',
    GLOWNSCAN_REFRESH_SESSION_ABSOLUTE_TTL_DAYS: '90',
    GLOWNSCAN_JWT_ISSUER: 'glownscan-api',
    GLOWNSCAN_JWT_AUDIENCE: 'glownscan-client',
    ...overrides,
  };
  return {
    get: (key: string, fallback?: string) => values[key] ?? fallback,
    getOrThrow: (key: string) => values[key],
  } as unknown as ConfigService;
}

function requiredEnvironment() {
  return {
    GLOWNSCAN_DATABASE_URL: 'postgres://test',
    GLOWNSCAN_JWT_ACCESS_SECRET: 'x'.repeat(32),
    GLOWNSCAN_SMTP_HOST: 'smtp.test',
    GLOWNSCAN_SMTP_USER: 'user',
    GLOWNSCAN_SMTP_PASSWORD: 'password',
    GLOWNSCAN_FRONTEND_URL: 'https://example.test',
    GLOWNSCAN_FIREBASE_PROJECT_ID: 'project',
    GLOWNSCAN_CLOUDINARY_CLOUD_NAME: 'cloud',
    GLOWNSCAN_CLOUDINARY_API_KEY: 'key',
    GLOWNSCAN_CLOUDINARY_API_SECRET: 'secret',
    GLOWNSCAN_ANALYSIS_AI_PROVIDER: 'OPENAI',
    GLOWNSCAN_OPENAI_API_KEY: 'key',
    GLOWNSCAN_GEMINI_API_KEY: 'key',
    GLOWNSCAN_SEPAY_WEBHOOK_SECRET: 'secret',
    GLOWNSCAN_SEPAY_BANK_ACCOUNT_NUMBER: '123',
    GLOWNSCAN_BANK_ACCOUNT_NAME: 'Test',
    GLOWNSCAN_BANK_BIN: '970423',
    GLOWNSCAN_REDIS_URL: 'redis://localhost',
  };
}
