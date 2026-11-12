import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { DatabaseModule } from '../../shared/database/database.module.js';
import { CloudinaryModule } from '../cloudinary/cloudinary.module.js';
import {
  CHANGE_PASSWORD_PORT,
  CHECK_ACTION_TOKEN_PORT,
  DEVICE_REGISTRATION_PORT,
  FIREBASE_ID_TOKEN_VERIFIER_PORT,
  FIREBASE_LOGIN_PORT,
  LOGIN_PORT,
  LOGOUT_PORT,
  REFRESH_SESSION_PORT,
  REGISTER_ACCOUNT_PORT,
  REQUEST_PASSWORD_RESET_PORT,
  RESEND_VERIFICATION_PORT,
  RESET_PASSWORD_PORT,
  USER_PROFILE_PORT,
  VALIDATE_ACCESS_TOKEN_PORT,
  VERIFY_EMAIL_PORT,
} from './application/ports/index.js';
import { AuthenticationService } from './application/use-case/authentication.service.js';
import { TokenService } from './application/use-case/token.service.js';
import { PostgresAuthenticationAdapter } from './infrastructure/adapters/postgres-authentication.adapter.js';
import { FirebaseIdTokenVerifier } from './infrastructure/adapters/firebase-id-token.verifier.js';
import { SmtpEmailService } from './infrastructure/adapters/smtp-email.service.js';
import { AuthController } from './presentation/auth.controller.js';
import { JwtAuthGuard } from '../../shared/security/jwt-auth.guard.js';
import { RateLimitModule } from '../../shared/rate-limit/rate-limit.module.js';
import { AdminGuard } from '../../shared/security/admin.guard.js';
import { AdminAccountService } from './application/use-case/admin-account.service.js';
import { AdminAccountController } from './presentation/admin-account.controller.js';
import { DeviceController } from './presentation/device.controller.js';
import { AUTHENTICATION_EMAIL_PORT } from './application/ports/authentication-email.port.js';
import { ADMIN_ACCOUNT_PORT } from './application/ports/admin-account.port.js';
import { PostgresAdminAccountAdapter } from './infrastructure/adapters/postgres-admin-account.adapter.js';
import { TOKEN_RUNTIME_PORT } from './application/ports/token-runtime.port.js';
import { JwtTokenRuntimeAdapter } from './infrastructure/adapters/jwt-token-runtime.adapter.js';
import { PASSWORD_HASHER_PORT } from './application/ports/password-hasher.port.js';
import { BcryptPasswordHasherAdapter } from './infrastructure/adapters/bcrypt-password-hasher.adapter.js';
import { AuditModule } from '../audit/audit.module.js';

@Module({
  imports: [
    ConfigModule,
    DatabaseModule,
    AuditModule,
    RateLimitModule,
    CloudinaryModule,
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => {
        const secret = config.getOrThrow<string>('GLOWNSCAN_JWT_ACCESS_SECRET');
        if (secret.length < 32) {
          throw new Error(
            'GLOWNSCAN_JWT_ACCESS_SECRET must contain at least 32 characters.',
          );
        }
        return {
          secret,
          signOptions: {
            expiresIn: Number(
              config.get<string>('GLOWNSCAN_ACCESS_TOKEN_TTL_SECONDS', '900'),
            ),
            issuer: config.get<string>('GLOWNSCAN_JWT_ISSUER', 'glownscan-api'),
            audience: config.get<string>(
              'GLOWNSCAN_JWT_AUDIENCE',
              'glownscan-client',
            ),
          },
          verifyOptions: {
            issuer: config.get<string>('GLOWNSCAN_JWT_ISSUER', 'glownscan-api'),
            audience: config.get<string>(
              'GLOWNSCAN_JWT_AUDIENCE',
              'glownscan-client',
            ),
          },
        };
      },
    }),
  ],
  controllers: [AuthController, AdminAccountController, DeviceController],
  providers: [
    PostgresAuthenticationAdapter,
    {
      provide: REGISTER_ACCOUNT_PORT,
      useExisting: PostgresAuthenticationAdapter,
    },
    {
      provide: VERIFY_EMAIL_PORT,
      useExisting: PostgresAuthenticationAdapter,
    },
    {
      provide: CHECK_ACTION_TOKEN_PORT,
      useExisting: PostgresAuthenticationAdapter,
    },
    {
      provide: RESEND_VERIFICATION_PORT,
      useExisting: PostgresAuthenticationAdapter,
    },
    {
      provide: LOGIN_PORT,
      useExisting: PostgresAuthenticationAdapter,
    },
    {
      provide: FIREBASE_LOGIN_PORT,
      useExisting: PostgresAuthenticationAdapter,
    },
    FirebaseIdTokenVerifier,
    {
      provide: FIREBASE_ID_TOKEN_VERIFIER_PORT,
      useExisting: FirebaseIdTokenVerifier,
    },
    {
      provide: REFRESH_SESSION_PORT,
      useExisting: PostgresAuthenticationAdapter,
    },
    {
      provide: LOGOUT_PORT,
      useExisting: PostgresAuthenticationAdapter,
    },
    {
      provide: REQUEST_PASSWORD_RESET_PORT,
      useExisting: PostgresAuthenticationAdapter,
    },
    {
      provide: RESET_PASSWORD_PORT,
      useExisting: PostgresAuthenticationAdapter,
    },
    {
      provide: CHANGE_PASSWORD_PORT,
      useExisting: PostgresAuthenticationAdapter,
    },
    {
      provide: VALIDATE_ACCESS_TOKEN_PORT,
      useExisting: PostgresAuthenticationAdapter,
    },
    {
      provide: USER_PROFILE_PORT,
      useExisting: PostgresAuthenticationAdapter,
    },
    {
      provide: DEVICE_REGISTRATION_PORT,
      useExisting: PostgresAuthenticationAdapter,
    },
    AuthenticationService,
    TokenService,
    JwtTokenRuntimeAdapter,
    { provide: TOKEN_RUNTIME_PORT, useExisting: JwtTokenRuntimeAdapter },
    SmtpEmailService,
    BcryptPasswordHasherAdapter,
    { provide: PASSWORD_HASHER_PORT, useExisting: BcryptPasswordHasherAdapter },
    {
      provide: AUTHENTICATION_EMAIL_PORT,
      useExisting: SmtpEmailService,
    },
    JwtAuthGuard,
    AdminGuard,
    AdminAccountService,
    PostgresAdminAccountAdapter,
    { provide: ADMIN_ACCOUNT_PORT, useExisting: PostgresAdminAccountAdapter },
  ],
  exports: [AuthenticationService, JwtAuthGuard, JwtModule],
})
export class AuthModule {}
