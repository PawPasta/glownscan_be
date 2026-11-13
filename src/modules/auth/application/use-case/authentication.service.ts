import { HttpStatus, Inject, Injectable, Logger } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import {
  BadRequestException,
  ApiException,
  ConflictException,
  ForbiddenException,
  InvalidAccessTokenException,
  SessionRevokedException,
  UnauthorizedException,
} from '../../../../shared/handler/http.exceptions.js';
import type { SecurityContext } from '../../../../shared/security/security.context.js';
import type { Uuid } from '../../../../shared/types/domain.types.js';
import {
  ActionTokenPurpose,
  UserStatus,
} from '../../domain/entities/enums/auth.enums.js';
import { Email } from '../../domain/value-objects/email.vo.js';
import { Password } from '../../domain/value-objects/password.vo.js';
import {
  CHANGE_PASSWORD_PORT,
  CHECK_ACTION_TOKEN_PORT,
  DEVICE_REGISTRATION_PORT,
  FIREBASE_ID_TOKEN_VERIFIER_PORT,
  FIREBASE_LOGIN_PORT,
  FirebaseAccountConflictError,
  InvalidFirebaseIdTokenError,
  RefreshTokenAlreadyRotatedError,
  LOGIN_PORT,
  LOGOUT_PORT,
  REFRESH_SESSION_PORT,
  REGISTER_ACCOUNT_PORT,
  REQUEST_PASSWORD_RESET_PORT,
  RESEND_VERIFICATION_PORT,
  RESET_PASSWORD_PORT,
  VALIDATE_ACCESS_TOKEN_PORT,
  VERIFY_EMAIL_PORT,
  type ChangePasswordPort,
  type DeviceRegistrationPort,
  type CheckActionTokenPort,
  type AuthUserRecord,
  type FirebaseIdTokenVerifierPort,
  type FirebaseIdentityClaims,
  type FirebaseLoginPort,
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
  USER_PROFILE_PORT,
  type UserProfilePort,
  type UserProfileUpdate,
  type ProfileSnapshot,
} from '../ports/index.js';
import {
  AUTHENTICATION_EMAIL_PORT,
  type AuthenticationEmailPort,
} from '../ports/authentication-email.port.js';
import { TokenService } from './token.service.js';
import type { TokenPayload } from '../ports/token-runtime.port.js';
import {
  PASSWORD_HASHER_PORT,
  type PasswordHasherPort,
} from '../ports/password-hasher.port.js';

interface RequestMetadata {
  ipAddress: string | null;
  userAgent: string | null;
}

@Injectable()
export class AuthenticationService {
  private readonly logger = new Logger(AuthenticationService.name);

  constructor(
    @Inject(REGISTER_ACCOUNT_PORT)
    private readonly registerAccountPort: RegisterAccountPort,
    @Inject(VERIFY_EMAIL_PORT)
    private readonly verifyEmailPort: VerifyEmailPort,
    @Inject(CHECK_ACTION_TOKEN_PORT)
    private readonly checkActionTokenPort: CheckActionTokenPort,
    @Inject(RESEND_VERIFICATION_PORT)
    private readonly resendVerificationPort: ResendVerificationPort,
    @Inject(LOGIN_PORT)
    private readonly loginPort: LoginPort,
    @Inject(FIREBASE_LOGIN_PORT)
    private readonly firebaseLoginPort: FirebaseLoginPort,
    @Inject(FIREBASE_ID_TOKEN_VERIFIER_PORT)
    private readonly firebaseIdTokenVerifier: FirebaseIdTokenVerifierPort,
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
    @Inject(USER_PROFILE_PORT)
    private readonly userProfilePort: UserProfilePort,
    @Inject(DEVICE_REGISTRATION_PORT)
    private readonly deviceRegistrationPort: DeviceRegistrationPort,
    @Inject(AUTHENTICATION_EMAIL_PORT)
    private readonly emailService: AuthenticationEmailPort,
    @Inject(PASSWORD_HASHER_PORT)
    private readonly passwordHasher: PasswordHasherPort,
    private readonly tokenService: TokenService,
  ) {}

  getProfile(userId: Uuid): Promise<ProfileSnapshot> {
    return this.userProfilePort.getProfile(userId);
  }

  async updateProfile(
    userId: Uuid,
    changes: UserProfileUpdate,
  ): Promise<ProfileSnapshot> {
    await this.userProfilePort.updateUserProfile(userId, changes);
    return this.getProfile(userId);
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
    const token = this.tokenService.createOpaqueToken();
    const registration: RegisterUserData = {
      email: email.value,
      passwordHash: await this.passwordHasher.hash(password.value),
      verificationTokenHash: this.tokenService.hashToken(token),
      tokenExpiresAt: this.tokenService.expiryInHours(24),
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
      this.tokenService.hashToken(input.token),
    );
    if (!verified) {
      throw new BadRequestException('Verification link is invalid or expired.');
    }
    return { message: 'Email verified successfully.' };
  }

  async checkEmailVerification(input: {
    email: string;
    token: string;
  }): Promise<{ success: boolean }> {
    return {
      success: await this.checkActionTokenPort.hasConsumedActionToken(
        parseEmail(input.email).value,
        this.tokenService.hashToken(input.token),
        ActionTokenPurpose.VerifyEmail,
      ),
    };
  }

  async checkPasswordReset(input: {
    email: string;
    token: string;
  }): Promise<{ success: boolean }> {
    return {
      success: await this.checkActionTokenPort.hasConsumedActionToken(
        parseEmail(input.email).value,
        this.tokenService.hashToken(input.token),
        ActionTokenPurpose.ResetPassword,
      ),
    };
  }

  async resendVerification(emailAddress: string): Promise<{ message: string }> {
    const email = parseEmail(emailAddress).value;
    const user = await this.resendVerificationPort.findUserByEmail(email);
    if (user?.status === UserStatus.PendingVerification) {
      const token = this.tokenService.createOpaqueToken();
      await this.resendVerificationPort.resendVerificationToken(
        user.id,
        this.tokenService.hashToken(token),
        this.tokenService.expiryInHours(24),
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
      platform?: string;
      fcmToken?: string;
      installationId?: string;
    },
    metadata: RequestMetadata,
  ): Promise<{ accessToken: string; refreshToken: string }> {
    const user = await this.loginPort.findUserByEmail(
      parseEmail(input.email).value,
    );
    if (!user) {
      throw new UnauthorizedException('Invalid email or password.');
    }
    const expiredLoginLock =
      user.status === UserStatus.Locked &&
      user.lockedUntil !== null &&
      user.lockedUntil <= new Date();
    if (user.status === UserStatus.Locked) {
      if (!user.lockedUntil || user.lockedUntil > new Date()) {
        throw new UnauthorizedException('Invalid email or password.');
      }
      await this.loginPort.unlockExpiredLoginLock(user.id);
    }
    if (
      user.passwordHash === null ||
      !(await this.passwordHasher.verify(input.password, user.passwordHash))
    ) {
      await this.loginPort.recordFailedLogin(user.email);
      throw new UnauthorizedException('Invalid email or password.');
    }
    if (user.status !== UserStatus.Active && !expiredLoginLock) {
      throw new ForbiddenException(
        user.status === UserStatus.PendingVerification
          ? 'Verify your email before logging in.'
          : 'This account cannot log in.',
      );
    }
    await this.loginPort.clearFailedLogins(user.id);

    return this.createLoginSession(
      user,
      input.platform,
      metadata,
      input.fcmToken,
      input.installationId,
    );
  }

  async loginMobile(
    input: {
      email: string;
      password: string;
      platform: 'ANDROID' | 'IOS';
      fcmToken?: string;
      installationId?: string;
    },
    metadata: RequestMetadata,
  ): Promise<{ accessToken: string; refreshToken: string }> {
    return this.login(
      { ...input, fcmToken: normalizeOptionalFcmToken(input.fcmToken) },
      metadata,
    );
  }

  async loginWithFirebase(
    input: {
      idToken: string;
      platform?: string;
      fcmToken?: string;
      installationId?: string;
    },
    metadata: RequestMetadata,
  ): Promise<{ accessToken: string; refreshToken: string }> {
    let identity: FirebaseIdentityClaims;
    try {
      identity = await this.firebaseIdTokenVerifier.verifyIdToken(
        input.idToken,
      );
    } catch (error) {
      if (error instanceof InvalidFirebaseIdTokenError) {
        throw new UnauthorizedException(
          'Firebase ID token is invalid or expired.',
        );
      }
      throw error;
    }

    if (!identity.emailVerified || !identity.email) {
      throw new UnauthorizedException(
        'A verified email is required to log in with Firebase.',
      );
    }

    let normalizedEmail: string;
    try {
      normalizedEmail = parseEmail(identity.email).value;
    } catch {
      throw new UnauthorizedException(
        'Firebase ID token does not contain a valid email address.',
      );
    }

    let user: AuthUserRecord;
    try {
      user = await this.firebaseLoginPort.findOrCreateFirebaseUser({
        ...identity,
        email: normalizedEmail,
      });
    } catch (error) {
      if (
        error instanceof FirebaseAccountConflictError ||
        isUniqueViolation(error)
      ) {
        throw new ConflictException(
          'This Firebase identity or email is already linked to another account.',
        );
      }
      throw error;
    }

    if (user.status === UserStatus.Locked) {
      throw new ForbiddenException('This account is temporarily locked.');
    }
    if (user.status !== UserStatus.Active) {
      throw new ForbiddenException('This account cannot log in.');
    }

    await this.loginPort.clearFailedLogins(user.id);
    return this.createLoginSession(
      user,
      input.platform,
      metadata,
      input.fcmToken,
      input.installationId,
    );
  }

  async loginWithFirebaseMobile(
    input: {
      idToken: string;
      platform: 'ANDROID' | 'IOS';
      fcmToken?: string;
      installationId?: string;
    },
    metadata: RequestMetadata,
  ): Promise<{ accessToken: string; refreshToken: string }> {
    return this.loginWithFirebase(
      { ...input, fcmToken: normalizeOptionalFcmToken(input.fcmToken) },
      metadata,
    );
  }

  async refresh(input: { accessToken: string; refreshToken: string }): Promise<{
    accessToken: string;
    refreshToken: string;
    expiresIn: number;
  }> {
    let payload: TokenPayload;
    try {
      payload = await this.tokenService.verifyAccessTokenForRefresh(
        input.accessToken,
      );
    } catch {
      throw new InvalidAccessTokenException();
    }
    const context = await this.validateAccessToken(payload);
    const replacementToken = this.tokenService.createOpaqueToken();
    let user: AuthUserRecord | null;
    try {
      user = await this.refreshSessionPort.rotateRefreshToken(
        this.tokenService.hashToken(input.refreshToken),
        this.tokenService.hashToken(replacementToken),
        this.tokenService.expiryInDays(this.tokenService.refreshTokenTtlDays),
        context.userId,
      );
    } catch (error) {
      if (error instanceof RefreshTokenAlreadyRotatedError) {
        throw new ApiException(
          HttpStatus.CONFLICT,
          'This refresh token was already rotated. Use the newest session tokens.',
          'REFRESH_TOKEN_ALREADY_ROTATED',
        );
      }
      throw error;
    }
    if (!user || user.status !== UserStatus.Active) {
      throw new SessionRevokedException();
    }
    return {
      accessToken: await this.tokenService.issueAccessToken(user),
      refreshToken: replacementToken,
      expiresIn: this.tokenService.accessTokenTtlSeconds,
    };
  }

  async logout(refreshToken: string): Promise<{ message: string }> {
    await this.logoutPort.revokeRefreshToken(
      this.tokenService.hashToken(refreshToken),
    );
    return { message: 'Logged out successfully.' };
  }

  async syncDeviceRegistration(
    userId: Uuid,
    input: {
      installationId: string;
      platform: 'ANDROID' | 'IOS';
      fcmToken: string;
      appVersion?: string;
      locale?: string;
      timezone?: string;
    },
  ): Promise<{ installationId: string; registered: true; updatedAt: string }> {
    const installationId = input.installationId.trim();
    const fcmToken = input.fcmToken.trim();
    if (!installationId || !fcmToken) {
      throw new BadRequestException(
        'Installation ID and FCM token must not be empty.',
      );
    }
    const synced = await this.deviceRegistrationPort.syncDeviceRegistration(
      userId,
      {
        installationId,
        platform: input.platform,
        fcmToken,
        appVersion: input.appVersion,
        locale: input.locale,
        timezone: input.timezone,
      },
    );
    return {
      installationId,
      registered: true,
      updatedAt: synced.updatedAt.toISOString(),
    };
  }

  async deactivateDeviceRegistration(
    userId: Uuid,
    installationId: string,
  ): Promise<void> {
    const normalized = installationId.trim();
    if (!normalized)
      throw new BadRequestException('Installation ID must not be empty.');
    await this.deviceRegistrationPort.deactivateDeviceRegistration(
      userId,
      normalized,
    );
  }

  async requestPasswordReset(
    emailAddress: string,
  ): Promise<{ message: string }> {
    const email = parseEmail(emailAddress).value;
    const user = await this.requestPasswordResetPort.findUserByEmail(email);
    if (user) {
      const token = this.tokenService.createOpaqueToken();
      await this.requestPasswordResetPort.createActionToken(
        user.id,
        ActionTokenPurpose.ResetPassword,
        this.tokenService.hashToken(token),
        this.tokenService.expiryInHours(1),
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
      this.tokenService.hashToken(input.token),
      await this.passwordHasher.hash(password.value),
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
    if (
      !user ||
      user.passwordHash === null ||
      !(await this.passwordHasher.verify(input.oldPassword, user.passwordHash))
    ) {
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
      await this.passwordHasher.hash(newPassword.value),
    );
    if (!changed) {
      throw new UnauthorizedException(
        'Password could not be changed. Please retry.',
      );
    }
    return { message: 'Password changed successfully. Please log in again.' };
  }

  private async createLoginSession(
    user: AuthUserRecord,
    platform: string | undefined,
    metadata: RequestMetadata,
    fcmToken?: string,
    installationId?: string,
  ): Promise<{ accessToken: string; refreshToken: string }> {
    const refreshToken = this.tokenService.createOpaqueToken();
    const session: RefreshSessionData = {
      userId: user.id,
      deviceUuid: installationId?.trim() || randomUUID(),
      platform: parsePlatform(platform),
      fcmToken,
      tokenHash: this.tokenService.hashToken(refreshToken),
      familyId: randomUUID(),
      expiresAt: this.tokenService.expiryInDays(
        this.tokenService.refreshTokenTtlDays,
      ),
      absoluteExpiresAt: this.tokenService.expiryInDays(
        this.tokenService.refreshSessionAbsoluteTtlDays,
      ),
      ipAddress: metadata.ipAddress,
      userAgent: metadata.userAgent,
    };
    await this.loginPort.createRefreshSession(session);
    return {
      accessToken: await this.tokenService.issueAccessToken(user),
      refreshToken,
    };
  }

  async validateAccessToken(payload: TokenPayload): Promise<SecurityContext> {
    const user = await this.validateAccessTokenPort.findUserById(payload.sub);
    if (
      !user ||
      user.status !== UserStatus.Active ||
      user.tokenVersion !== payload.tokenVersion
    ) {
      throw new SessionRevokedException();
    }
    return {
      userId: user.id,
      email: user.email,
      tokenVersion: user.tokenVersion,
      roles: user.roles,
    };
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

function normalizeOptionalFcmToken(token?: string): string | undefined {
  if (token === undefined) return undefined;
  const normalized = token.trim();
  if (!normalized)
    throw new BadRequestException('FCM token must not be empty.');
  return normalized;
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
