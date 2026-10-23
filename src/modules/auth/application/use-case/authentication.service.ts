import { Inject, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { compare, hash } from 'bcryptjs';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  UnauthorizedException,
} from '../../../../shared/handler/http.exceptions.js';
import type { SecurityContext } from '../../../../shared/security/security.context.js';
import {
  ActionTokenPurpose,
  UserStatus,
} from '../../domain/entities/enums/auth.enums.js';
import { Email } from '../../domain/value-objects/email.vo.js';
import { Password } from '../../domain/value-objects/password.vo.js';
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
  type AuthUserRecord,
  type ChangePasswordPort,
  type LoginPort,
  type LogoutPort,
  type RefreshSessionData,
  type RefreshSessionPort,
  type RegisterAccountPort,
  type RegisterUserData,
  type RequestPasswordResetPort,
  type ResendVerificationPort,
  type ResetPasswordPort,
  type ValidateAccessTokenPort,
  type VerifyEmailPort,
} from '../ports/index.js';
import { SmtpEmailService } from '../../infrastructure/adapters/smtp-email.service.js';

interface TokenPayload {
  sub: string;
  email: string;
  tokenVersion: number;
  roles: string[];
}

interface RequestMetadata {
  ipAddress: string | null;
  userAgent: string | null;
}

@Injectable()
export class AuthenticationService {
  private readonly logger = new Logger(AuthenticationService.name);
  private readonly accessTokenTtlSeconds: number;
  private readonly refreshTokenTtlDays: number;

  constructor(
    @Inject(REGISTER_ACCOUNT_PORT)
    private readonly registerAccountPort: RegisterAccountPort,
    @Inject(VERIFY_EMAIL_PORT)
    private readonly verifyEmailPort: VerifyEmailPort,
    @Inject(RESEND_VERIFICATION_PORT)
    private readonly resendVerificationPort: ResendVerificationPort,
    @Inject(LOGIN_PORT)
    private readonly loginPort: LoginPort,
    @Inject(REFRESH_SESSION_PORT)
    private readonly refreshSessionPort: RefreshSessionPort,
    @Inject(LOGOUT_PORT)
    private readonly logoutPort: LogoutPort,
    @Inject(REQUEST_PASSWORD_RESET_PORT)
    private readonly requestPasswordResetPort: RequestPasswordResetPort,
    @Inject(RESET_PASSWORD_PORT)
    private readonly resetPasswordPort: ResetPasswordPort,
    @Inject(CHANGE_PASSWORD_PORT)
    private readonly changePasswordPort: ChangePasswordPort,
    @Inject(VALIDATE_ACCESS_TOKEN_PORT)
    private readonly validateAccessTokenPort: ValidateAccessTokenPort,
    private readonly emailService: SmtpEmailService,
    private readonly jwt: JwtService,
    config: ConfigService,
  ) {
    this.accessTokenTtlSeconds = Number(
      config.get<string>('GLOWNSCAN_ACCESS_TOKEN_TTL_SECONDS', '900'),
    );
    this.refreshTokenTtlDays = Number(
      config.get<string>('GLOWNSCAN_REFRESH_TOKEN_TTL_DAYS', '30'),
    );
    if (
      !Number.isInteger(this.accessTokenTtlSeconds) ||
      this.accessTokenTtlSeconds < 60 ||
      !Number.isInteger(this.refreshTokenTtlDays) ||
      this.refreshTokenTtlDays < 1
    ) {
      throw new Error('JWT and refresh token expiration settings are invalid.');
    }
  }

  async register(input: {
    email: string;
    password: string;
    confirmPassword: string;
  }): Promise<{ message: string }> {
    const email = parseEmail(input.email);
    const password = parsePassword(input.password);
    if (password.value !== input.confirmPassword) {
      throw new BadRequestException('Password confirmation does not match.');
    }
    const token = this.createOpaqueToken();
    const registration: RegisterUserData = {
      email: email.value,
      passwordHash: await hash(password.value, 12),
      verificationTokenHash: this.hashToken(token),
      tokenExpiresAt: this.expiryInHours(24),
    };

    try {
      await this.registerAccountPort.registerUser(registration);
    } catch (error) {
      if (isUniqueViolation(error)) {
        throw new ConflictException(
          'An account with this email already exists.',
        );
      }
      throw error;
    }

    await this.emailService.sendVerificationEmail(email.value, token);
    return {
      message:
        'Registration successful. Check your email to verify the account.',
    };
  }

  async verifyEmail(input: {
    email: string;
    token: string;
  }): Promise<{ message: string }> {
    const verified = await this.verifyEmailPort.verifyEmail(
      parseEmail(input.email).value,
      this.hashToken(input.token),
    );
    if (!verified) {
      throw new BadRequestException('Verification link is invalid or expired.');
    }
    return { message: 'Email verified successfully.' };
  }

  async resendVerification(emailAddress: string): Promise<{ message: string }> {
    const email = parseEmail(emailAddress).value;
    const user = await this.resendVerificationPort.findUserByEmail(email);
    if (user?.status === UserStatus.PendingVerification) {
      const token = this.createOpaqueToken();
      await this.resendVerificationPort.resendVerificationToken(
        user.id,
        this.hashToken(token),
        this.expiryInHours(24),
      );
      try {
        await this.emailService.sendVerificationEmail(email, token);
      } catch (error) {
        this.logger.error(
          'Could not send verification email.',
          error instanceof Error ? error.stack : undefined,
        );
      }
    }
    return {
      message: 'If verification is required, a new email has been sent.',
    };
  }

  async login(
    input: {
      email: string;
      password: string;
      deviceUuid?: string;
      platform?: string;
    },
    metadata: RequestMetadata,
  ): Promise<{ accessToken: string; refreshToken: string; expiresIn: number }> {
    const user = await this.loginPort.findUserByEmail(
      parseEmail(input.email).value,
    );
    if (!user) {
      throw new UnauthorizedException('Invalid email or password.');
    }
    if (user.status === UserStatus.Locked) {
      throw new ForbiddenException('This account is temporarily locked.');
    }
    if (!(await compare(input.password, user.passwordHash))) {
      await this.loginPort.recordFailedLogin(user.email);
      throw new UnauthorizedException('Invalid email or password.');
    }
    if (user.status !== UserStatus.Active) {
      throw new ForbiddenException(
        user.status === UserStatus.PendingVerification
          ? 'Verify your email before logging in.'
          : 'This account cannot log in.',
      );
    }
    await this.loginPort.clearFailedLogins(user.id);

    const refreshToken = this.createOpaqueToken();
    const session: RefreshSessionData = {
      userId: user.id,
      deviceUuid: input.deviceUuid ?? randomUUID(),
      platform: parsePlatform(input.platform),
      tokenHash: this.hashToken(refreshToken),
      familyId: randomUUID(),
      expiresAt: this.expiryInDays(this.refreshTokenTtlDays),
      ipAddress: metadata.ipAddress,
      userAgent: metadata.userAgent,
    };
    await this.loginPort.createRefreshSession(session);
    return {
      accessToken: await this.issueAccessToken(user),
      refreshToken,
      expiresIn: this.accessTokenTtlSeconds,
    };
  }

  async refresh(refreshToken: string): Promise<{
    accessToken: string;
    refreshToken: string;
    expiresIn: number;
  }> {
    const replacementToken = this.createOpaqueToken();
    const user = await this.refreshSessionPort.rotateRefreshToken(
      this.hashToken(refreshToken),
      this.hashToken(replacementToken),
      this.expiryInDays(this.refreshTokenTtlDays),
    );
    if (!user || user.status !== UserStatus.Active) {
      throw new UnauthorizedException('Refresh token is invalid or expired.');
    }
    return {
      accessToken: await this.issueAccessToken(user),
      refreshToken: replacementToken,
      expiresIn: this.accessTokenTtlSeconds,
    };
  }

  async logout(refreshToken: string): Promise<{ message: string }> {
    await this.logoutPort.revokeRefreshToken(this.hashToken(refreshToken));
    return { message: 'Logged out successfully.' };
  }

  async requestPasswordReset(emailAddress: string): Promise<{ message: string }> {
    const email = parseEmail(emailAddress).value;
    const user = await this.requestPasswordResetPort.findUserByEmail(email);
    if (user) {
      const token = this.createOpaqueToken();
      await this.requestPasswordResetPort.createActionToken(
        user.id,
        ActionTokenPurpose.ResetPassword,
        this.hashToken(token),
        this.expiryInHours(1),
      );
      try {
        await this.emailService.sendPasswordResetEmail(email, token);
      } catch (error) {
        this.logger.error(
          'Could not send password reset email.',
          error instanceof Error ? error.stack : undefined,
        );
      }
    }
    return {
      message:
        'If an account exists for this email, a reset link will be sent.',
    };
  }

  async resetPassword(input: {
    email: string;
    token: string;
    newPassword: string;
  }): Promise<{ message: string }> {
    const password = parsePassword(input.newPassword);
    const updated = await this.resetPasswordPort.resetPassword(
      parseEmail(input.email).value,
      this.hashToken(input.token),
      await hash(password.value, 12),
    );
    if (!updated) {
      throw new BadRequestException(
        'Password reset link is invalid or expired.',
      );
    }
    return { message: 'Password reset successfully.' };
  }

  async changePassword(
    context: SecurityContext,
    input: { oldPassword: string; newPassword: string },
  ): Promise<{ message: string }> {
    const user = await this.changePasswordPort.findUserById(context.userId);
    if (!user || !(await compare(input.oldPassword, user.passwordHash))) {
      throw new UnauthorizedException('Current password is incorrect.');
    }
    const newPassword = parsePassword(input.newPassword);
    if (newPassword.value === input.oldPassword) {
      throw new BadRequestException(
        'New password must differ from current password.',
      );
    }
    const changed = await this.changePasswordPort.changePassword(
      user.id,
      user.passwordHash,
      await hash(newPassword.value, 12),
    );
    if (!changed) {
      throw new UnauthorizedException(
        'Password could not be changed. Please retry.',
      );
    }
    return { message: 'Password changed successfully. Please log in again.' };
  }

  async validateAccessToken(payload: TokenPayload): Promise<SecurityContext> {
    const user = await this.validateAccessTokenPort.findUserById(payload.sub);
    if (
      !user ||
      user.status !== UserStatus.Active ||
      user.tokenVersion !== payload.tokenVersion
    ) {
      throw new UnauthorizedException('Access token is no longer valid.');
    }
    return {
      userId: user.id,
      email: user.email,
      tokenVersion: user.tokenVersion,
      roles: user.roles,
    };
  }

  private issueAccessToken(user: AuthUserRecord): Promise<string> {
    return this.jwt.signAsync({
      sub: user.id,
      email: user.email,
      tokenVersion: user.tokenVersion,
      roles: user.roles,
    } satisfies TokenPayload);
  }

  private createOpaqueToken(): string {
    return randomBytes(32).toString('base64url');
  }

  private hashToken(token: string): string {
    return createHash('sha256').update(token).digest('hex');
  }

  private expiryInHours(hours: number): Date {
    return new Date(Date.now() + hours * 60 * 60 * 1000);
  }

  private expiryInDays(days: number): Date {
    return new Date(Date.now() + days * 24 * 60 * 60 * 1000);
  }
}

function parsePlatform(platform?: string): 'ANDROID' | 'IOS' | 'WEBSITE' {
  if (platform === undefined || platform === 'WEBSITE') {
    return 'WEBSITE';
  }
  if (platform === 'ANDROID' || platform === 'IOS') {
    return platform;
  }
  throw new BadRequestException('Platform must be ANDROID, IOS, or WEBSITE.');
}

function isUniqueViolation(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    error.code === '23505'
  );
}

function parseEmail(value: string): Email {
  try {
    return new Email(value);
  } catch (error) {
    throw new BadRequestException(
      error instanceof Error ? error.message : 'Email is invalid.',
    );
  }
}

function parsePassword(value: string): Password {
  try {
    return Password.create(value);
  } catch (error) {
    throw new BadRequestException(
      error instanceof Error ? error.message : 'Password does not meet policy.',
    );
  }
}
