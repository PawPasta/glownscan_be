import { ConfigModule } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import { describe, expect, it, vi } from 'vitest';
import { AuthModule } from '../src/modules/auth/auth.module.js';
import { AuthController } from '../src/modules/auth/presentation/auth.controller.js';
import { DatabaseService } from '../src/shared/database/database.service.js';
import { JwtAuthGuard } from '../src/shared/security/jwt-auth.guard.js';

describe('AuthModule dependency wiring', () => {
  it('resolves the shared JWT guard and its authentication dependencies', async () => {
    const module = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({
          isGlobal: true,
          ignoreEnvFile: true,
          load: [
            () => ({
              GLOWNSCAN_JWT_ACCESS_SECRET:
                'auth-module-test-secret-0123456789abcdef',
              GLOWNSCAN_ACCESS_TOKEN_TTL_SECONDS: '900',
              GLOWNSCAN_REFRESH_TOKEN_TTL_DAYS: '30',
              GLOWNSCAN_FIREBASE_PROJECT_ID: 'auth-module-test',
              GLOWNSCAN_CLOUDINARY_CLOUD_NAME: 'test-cloud',
              GLOWNSCAN_CLOUDINARY_API_KEY: 'test-key',
              GLOWNSCAN_CLOUDINARY_API_SECRET: 'test-secret',
              GLOWNSCAN_SMTP_HOST: 'localhost',
              GLOWNSCAN_SMTP_USER: 'test-user',
              GLOWNSCAN_SMTP_PASSWORD: 'test-password',
              GLOWNSCAN_SMTP_FROM: 'noreply@example.test',
              GLOWNSCAN_FRONTEND_URL: 'http://localhost:5173',
            }),
          ],
        }),
        AuthModule,
      ],
    })
      .overrideProvider(DatabaseService)
      .useValue({
        query: vi.fn(),
        transaction: vi.fn(),
      })
      .compile();

    try {
      expect(module.get(AuthController)).toBeInstanceOf(AuthController);
      expect(module.get(JwtAuthGuard, { strict: false })).toBeInstanceOf(
        JwtAuthGuard,
      );
    } finally {
      await module.close();
    }
  });
});
