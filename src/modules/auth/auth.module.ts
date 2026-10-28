import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { DatabaseModule } from '../../shared/database/database.module.js';
import {
  CHANGE_PASSWORD_PORT,
  LOGIN_PORT,
  LOGOUT_PORT,
  REFRESH_SESSION_PORT,
  REGISTER_ACCOUNT_PORT,
  REQUEST_PASSWORD_RESET_PORT,
  RESEND_VERIFICATION_PORT,
  RESET_PASSWORD_PORT,
  VALIDATE_ACCESS_TOKEN_PORT,
  VERIFY_EMAIL_PORT,
} from './application/ports/index.js';
import { AuthenticationService } from './application/use-case/authentication.service.js';
import { TokenService } from './application/use-case/token.service.js';
import { PostgresAuthenticationAdapter } from './infrastructure/adapters/postgres-authentication.adapter.js';
import { SmtpEmailService } from './infrastructure/adapters/smtp-email.service.js';
import { AuthController } from './presentation/auth.controller.js';
import { JwtAuthGuard } from '../../shared/security/jwt-auth.guard.js';

@Module({
  imports: [
    ConfigModule,
    DatabaseModule,
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
          },
        };
      },
    }),
  ],
  controllers: [AuthController],
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
      provide: RESEND_VERIFICATION_PORT,
      useExisting: PostgresAuthenticationAdapter,
    },
    {
      provide: LOGIN_PORT,
      useExisting: PostgresAuthenticationAdapter,
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
    AuthenticationService,
    TokenService,
    SmtpEmailService,
    JwtAuthGuard,
  ],
  exports: [AuthenticationService, JwtAuthGuard, JwtModule],
})
export class AuthModule {}
