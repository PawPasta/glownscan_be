import type { ActionTokenPurpose } from '../../domain/entities/enums/auth.enums.js';
import type { Uuid } from '../../../../shared/types/domain.types.js';

export interface AuthUserRecord {
  id: Uuid;
  email: string;
  passwordHash: string;
  status: string;
  tokenVersion: number;
  roles: string[];
  failedLoginCount: number;
  lockedUntil: Date | null;
}

export interface RegisterUserData {
  email: string;
  passwordHash: string;
  verificationTokenHash: string;
  tokenExpiresAt: Date;
}

export interface RefreshSessionData {
  userId: Uuid;
  deviceUuid: string;
  platform: 'ANDROID' | 'IOS' | 'WEBSITE';
  tokenHash: string;
  familyId: Uuid;
  expiresAt: Date;
  ipAddress: string | null;
  userAgent: string | null;
}

export interface RegisterAccountPort {
  registerUser(data: RegisterUserData): Promise<void>;
}

export interface VerifyEmailPort {
  verifyEmail(email: string, tokenHash: string): Promise<boolean>;
}

export interface ResendVerificationPort {
  findUserByEmail(email: string): Promise<AuthUserRecord | null>;
  resendVerificationToken(
    userId: Uuid,
    tokenHash: string,
    expiresAt: Date,
  ): Promise<void>;
}

export interface LoginPort {
  findUserByEmail(email: string): Promise<AuthUserRecord | null>;
  recordFailedLogin(email: string): Promise<void>;
  clearFailedLogins(userId: Uuid): Promise<void>;
  createRefreshSession(data: RefreshSessionData): Promise<void>;
}

export interface RefreshSessionPort {
  rotateRefreshToken(
    oldTokenHash: string,
    newTokenHash: string,
    expiresAt: Date,
  ): Promise<AuthUserRecord | null>;
}

export interface LogoutPort {
  revokeRefreshToken(tokenHash: string): Promise<void>;
}

export interface RequestPasswordResetPort {
  findUserByEmail(email: string): Promise<AuthUserRecord | null>;
  createActionToken(
    userId: Uuid,
    purpose: ActionTokenPurpose,
    tokenHash: string,
    expiresAt: Date,
  ): Promise<void>;
}

export interface ResetPasswordPort {
  resetPassword(
    email: string,
    tokenHash: string,
    passwordHash: string,
  ): Promise<boolean>;
}

export interface ChangePasswordPort {
  findUserById(userId: Uuid): Promise<AuthUserRecord | null>;
  changePassword(
    userId: Uuid,
    currentPasswordHash: string,
    newPasswordHash: string,
  ): Promise<boolean>;
}

export interface ValidateAccessTokenPort {
  findUserById(userId: Uuid): Promise<AuthUserRecord | null>;
}

export const REGISTER_ACCOUNT_PORT = Symbol('REGISTER_ACCOUNT_PORT');
export const VERIFY_EMAIL_PORT = Symbol('VERIFY_EMAIL_PORT');
export const RESEND_VERIFICATION_PORT = Symbol('RESEND_VERIFICATION_PORT');
export const LOGIN_PORT = Symbol('LOGIN_PORT');
export const REFRESH_SESSION_PORT = Symbol('REFRESH_SESSION_PORT');
export const LOGOUT_PORT = Symbol('LOGOUT_PORT');
export const REQUEST_PASSWORD_RESET_PORT = Symbol(
  'REQUEST_PASSWORD_RESET_PORT',
);
export const RESET_PASSWORD_PORT = Symbol('RESET_PASSWORD_PORT');
export const CHANGE_PASSWORD_PORT = Symbol('CHANGE_PASSWORD_PORT');
export const VALIDATE_ACCESS_TOKEN_PORT = Symbol(
  'VALIDATE_ACCESS_TOKEN_PORT',
);
