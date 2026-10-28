import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { Test, type TestingModule } from '@nestjs/testing';
import { compare, hash } from 'bcryptjs';
import { vi } from 'vitest';
import {
  CHANGE_PASSWORD_PORT,
  FIREBASE_ID_TOKEN_VERIFIER_PORT,
  FIREBASE_LOGIN_PORT,
  FirebaseAccountConflictError,
  InvalidFirebaseIdTokenError,
  LOGIN_PORT,
  LOGOUT_PORT,
  REFRESH_SESSION_PORT,
  REGISTER_ACCOUNT_PORT,
  REQUEST_PASSWORD_RESET_PORT,
  RESEND_VERIFICATION_PORT,
  RESET_PASSWORD_PORT,
  VALIDATE_ACCESS_TOKEN_PORT,
  VERIFY_EMAIL_PORT,
} from '../src/modules/auth/application/ports/index.js';
import { AuthenticationService } from '../src/modules/auth/application/use-case/authentication.service.js';
import { TokenService } from '../src/modules/auth/application/use-case/token.service.js';
import { UserStatus } from '../src/modules/auth/domain/entities/enums/auth.enums.js';
import { SmtpEmailService } from '../src/modules/auth/infrastructure/adapters/smtp-email.service.js';
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  UnauthorizedException,
} from '../src/shared/handler/http.exceptions.js';

const userId = '25bdca3a-e978-4bdb-96f3-51fb5b0413bc';

describe('AuthenticationService', () => {
  let moduleRef: TestingModule;
  let service: AuthenticationService;
  let repository: {
    registerUser: ReturnType<typeof vi.fn>;
    findOrCreateFirebaseUser: ReturnType<typeof vi.fn>;
    findUserByEmail: ReturnType<typeof vi.fn>;
    findUserById: ReturnType<typeof vi.fn>;
    recordFailedLogin: ReturnType<typeof vi.fn>;
    clearFailedLogins: ReturnType<typeof vi.fn>;
    resendVerificationToken: ReturnType<typeof vi.fn>;
    verifyEmail: ReturnType<typeof vi.fn>;
    createActionToken: ReturnType<typeof vi.fn>;
    resetPassword: ReturnType<typeof vi.fn>;
    changePassword: ReturnType<typeof vi.fn>;
    createRefreshSession: ReturnType<typeof vi.fn>;
    rotateRefreshToken: ReturnType<typeof vi.fn>;
    revokeRefreshToken: ReturnType<typeof vi.fn>;
  };
  let emailService: {
    sendVerificationEmail: ReturnType<typeof vi.fn>;
    sendPasswordResetEmail: ReturnType<typeof vi.fn>;
  };
  let jwt: {
    signAsync: ReturnType<typeof vi.fn>;
    verifyAsync: ReturnType<typeof vi.fn>;
  };
  let firebaseIdTokenVerifier: {
    verifyIdToken: ReturnType<typeof vi.fn>;
  };

  beforeEach(async () => {
    repository = {
      registerUser: vi.fn().mockResolvedValue(undefined),
      findOrCreateFirebaseUser: vi.fn(),
      findUserByEmail: vi.fn(),
      findUserById: vi.fn(),
      recordFailedLogin: vi.fn().mockResolvedValue(undefined),
      clearFailedLogins: vi.fn().mockResolvedValue(undefined),
      resendVerificationToken: vi.fn().mockResolvedValue(undefined),
      verifyEmail: vi.fn(),
      createActionToken: vi.fn().mockResolvedValue(undefined),
      resetPassword: vi.fn(),
      changePassword: vi.fn(),
      createRefreshSession: vi.fn().mockResolvedValue(undefined),
      rotateRefreshToken: vi.fn(),
      revokeRefreshToken: vi.fn().mockResolvedValue(undefined),
    };
    emailService = {
      sendVerificationEmail: vi.fn().mockResolvedValue(undefined),
      sendPasswordResetEmail: vi.fn().mockResolvedValue(undefined),
    };
    jwt = {
      signAsync: vi.fn().mockResolvedValue('signed-access-token'),
      verifyAsync: vi.fn(),
    };
    firebaseIdTokenVerifier = {
      verifyIdToken: vi.fn(),
    };

    moduleRef = await Test.createTestingModule({
      providers: [
        AuthenticationService,
        TokenService,
        { provide: REGISTER_ACCOUNT_PORT, useValue: repository },
        { provide: VERIFY_EMAIL_PORT, useValue: repository },
        { provide: RESEND_VERIFICATION_PORT, useValue: repository },
        { provide: LOGIN_PORT, useValue: repository },
        { provide: FIREBASE_LOGIN_PORT, useValue: repository },
        {
          provide: FIREBASE_ID_TOKEN_VERIFIER_PORT,
          useValue: firebaseIdTokenVerifier,
        },
        { provide: REFRESH_SESSION_PORT, useValue: repository },
        { provide: LOGOUT_PORT, useValue: repository },
        { provide: REQUEST_PASSWORD_RESET_PORT, useValue: repository },
        { provide: RESET_PASSWORD_PORT, useValue: repository },
        { provide: CHANGE_PASSWORD_PORT, useValue: repository },
        { provide: VALIDATE_ACCESS_TOKEN_PORT, useValue: repository },
        { provide: SmtpEmailService, useValue: emailService },
        { provide: JwtService, useValue: jwt },
        {
          provide: ConfigService,
          useValue: {
            get: (_key: string, defaultValue?: string) => defaultValue,
          },
        },
      ],
    }).compile();
    service = moduleRef.get(AuthenticationService);
  });

  afterEach(async () => {
    await moduleRef.close();
  });

  it('rejects registration when password confirmation does not match', async () => {
    await expect(
      service.register({
        email: 'user@example.com',
        password: 'Glow123!',
        confirmPassword: 'Different123!',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(repository.registerUser).not.toHaveBeenCalled();
  });

  it('stores password and verification token hashes before sending email', async () => {
    await service.register({
      email: ' User@Example.com ',
      password: 'Glow123!',
      confirmPassword: 'Glow123!',
    });

    const [registration] = repository.registerUser.mock.calls[0] as [
      {
        email: string;
        passwordHash: string;
        verificationTokenHash: string;
        tokenExpiresAt: Date;
      },
    ];
    expect(registration.email).toBe('user@example.com');
    expect(registration.passwordHash).not.toBe('Glow123!');
    await expect(compare('Glow123!', registration.passwordHash)).resolves.toBe(
      true,
    );
    expect(registration.verificationTokenHash).toMatch(/^[0-9a-f]{64}$/);
    const [sentEmail, rawToken] =
      emailService.sendVerificationEmail.mock.calls[0] as [string, string];
    expect(sentEmail).toBe('user@example.com');
    expect(rawToken).not.toBe(registration.verificationTokenHash);
  });

  it('issues access and refresh tokens only for verified active accounts', async () => {
    repository.findUserByEmail.mockResolvedValue({
      id: userId,
      email: 'user@example.com',
      passwordHash: await hash('Glow123!', 4),
      status: UserStatus.Active,
      tokenVersion: 1,
      roles: ['USER'],
      failedLoginCount: 0,
      lockedUntil: null,
    });

    const result = await service.login(
      { email: 'user@example.com', password: 'Glow123!' },
      { ipAddress: null, userAgent: null },
    );

    expect(result.accessToken).toBe('signed-access-token');
    expect(result.refreshToken).toHaveLength(43);
    expect(result).not.toHaveProperty('expiresIn');
    const [session] = repository.createRefreshSession.mock.calls[0] as [
      { userId: string; deviceUuid: string; tokenHash: string },
    ];
    expect(session.userId).toBe(userId);
    expect(session.deviceUuid).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
    );
    expect(session.tokenHash).toMatch(/^[0-9a-f]{64}$/);
    expect(session.tokenHash).not.toBe(result.refreshToken);
  });

  it('logs in with a verified Firebase identity and a backend-generated device UUID', async () => {
    const identity = {
      uid: 'firebase-user-123',
      email: 'User@Example.com',
      emailVerified: true,
      name: 'Paw Pasta',
      picture: 'https://example.com/avatar.png',
      signInProvider: 'google.com',
      providerData: {
        iss: 'https://securetoken.google.com/glownscan-test',
        aud: 'glownscan-test',
        auth_time: 1793208897,
        user_id: 'firebase-user-123',
        sub: 'firebase-user-123',
        iat: 1793208897,
        exp: 1793212497,
        email: 'User@Example.com',
        email_verified: true,
        firebase: {
          identities: {
            'google.com': ['google-user-456'],
            email: ['User@Example.com'],
          },
          sign_in_provider: 'google.com',
        },
      },
    };
    firebaseIdTokenVerifier.verifyIdToken.mockResolvedValue(identity);
    repository.findOrCreateFirebaseUser.mockResolvedValue({
      id: userId,
      email: 'user@example.com',
      passwordHash: null,
      status: UserStatus.Active,
      tokenVersion: 1,
      roles: ['USER'],
      failedLoginCount: 0,
      lockedUntil: null,
    });

    const result = await service.loginWithFirebase(
      { idToken: 'firebase-id-token', platform: 'IOS' },
      { ipAddress: null, userAgent: null },
    );

    expect(firebaseIdTokenVerifier.verifyIdToken).toHaveBeenCalledWith(
      'firebase-id-token',
    );
    expect(repository.findOrCreateFirebaseUser).toHaveBeenCalledWith({
      ...identity,
      email: 'user@example.com',
    });
    const [session] = repository.createRefreshSession.mock.calls[0] as [
      { userId: string; deviceUuid: string; platform: string },
    ];
    expect(session.userId).toBe(userId);
    expect(session.deviceUuid).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
    );
    expect(session.platform).toBe('IOS');
    expect(result.accessToken).toBe('signed-access-token');
    expect(result.refreshToken).toHaveLength(43);
  });

  it('rejects invalid Firebase ID tokens without looking up an account', async () => {
    firebaseIdTokenVerifier.verifyIdToken.mockRejectedValue(
      new InvalidFirebaseIdTokenError(),
    );

    await expect(
      service.loginWithFirebase(
        { idToken: 'invalid-token' },
        { ipAddress: null, userAgent: null },
      ),
    ).rejects.toBeInstanceOf(UnauthorizedException);
    expect(repository.findOrCreateFirebaseUser).not.toHaveBeenCalled();
  });

  it('rejects Firebase identities without a verified email', async () => {
    firebaseIdTokenVerifier.verifyIdToken.mockResolvedValue({
      uid: 'firebase-user-123',
      email: 'user@example.com',
      emailVerified: false,
      name: null,
      picture: null,
      signInProvider: 'google.com',
      providerData: {},
    });

    await expect(
      service.loginWithFirebase(
        { idToken: 'firebase-id-token' },
        { ipAddress: null, userAgent: null },
      ),
    ).rejects.toBeInstanceOf(UnauthorizedException);
    expect(repository.findOrCreateFirebaseUser).not.toHaveBeenCalled();
  });

  it('rejects a Firebase identity that is already linked to another account', async () => {
    firebaseIdTokenVerifier.verifyIdToken.mockResolvedValue({
      uid: 'firebase-user-123',
      email: 'user@example.com',
      emailVerified: true,
      name: null,
      picture: null,
      signInProvider: 'google.com',
      providerData: {},
    });
    repository.findOrCreateFirebaseUser.mockRejectedValue(
      new FirebaseAccountConflictError(),
    );

    await expect(
      service.loginWithFirebase(
        { idToken: 'firebase-id-token' },
        { ipAddress: null, userAgent: null },
      ),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(repository.createRefreshSession).not.toHaveBeenCalled();
  });

  it('rotates refresh tokens only when paired with a valid current access token', async () => {
    const claims = {
      sub: userId,
      email: 'user@example.com',
      tokenVersion: 1,
      roles: ['USER'],
    };
    const user = {
      id: userId,
      email: 'user@example.com',
      passwordHash: 'password-hash',
      status: UserStatus.Active,
      tokenVersion: 1,
      roles: ['USER'],
      failedLoginCount: 0,
      lockedUntil: null,
    };
    jwt.verifyAsync.mockResolvedValue(claims);
    repository.findUserById.mockResolvedValue(user);
    repository.rotateRefreshToken.mockResolvedValue(user);

    const result = await service.refresh({
      accessToken: 'expired-but-valid-access-token',
      refreshToken: 'current-refresh-token'.padEnd(32, 'x'),
    });

    expect(jwt.verifyAsync).toHaveBeenCalledWith(
      'expired-but-valid-access-token',
      { ignoreExpiration: true },
    );
    expect(repository.rotateRefreshToken).toHaveBeenCalledWith(
      expect.stringMatching(/^[0-9a-f]{64}$/),
      expect.stringMatching(/^[0-9a-f]{64}$/),
      expect.any(Date),
      userId,
    );
    expect(result.accessToken).toBe('signed-access-token');
    expect(result.refreshToken).toHaveLength(43);
  });

  it('rejects refresh when the current access token cannot be verified', async () => {
    jwt.verifyAsync.mockRejectedValue(new Error('Token expired or invalid'));

    await expect(
      service.refresh({
        accessToken: 'invalid-access-token',
        refreshToken: 'current-refresh-token'.padEnd(32, 'x'),
      }),
    ).rejects.toBeInstanceOf(UnauthorizedException);
    expect(repository.rotateRefreshToken).not.toHaveBeenCalled();
  });

  it('records failed login attempts for an existing account', async () => {
    repository.findUserByEmail.mockResolvedValue({
      id: userId,
      email: 'user@example.com',
      passwordHash: await hash('Glow123!', 4),
      status: UserStatus.Active,
      tokenVersion: 1,
      roles: ['USER'],
      failedLoginCount: 0,
      lockedUntil: null,
    });

    await expect(
      service.login(
        { email: 'user@example.com', password: 'Wrong123!' },
        { ipAddress: null, userAgent: null },
      ),
    ).rejects.toBeInstanceOf(UnauthorizedException);
    expect(repository.recordFailedLogin).toHaveBeenCalledWith(
      'user@example.com',
    );
  });

  it('refuses login for an account in its lockout period', async () => {
    repository.findUserByEmail.mockResolvedValue({
      id: userId,
      email: 'user@example.com',
      passwordHash: await hash('Glow123!', 4),
      status: UserStatus.Locked,
      tokenVersion: 1,
      roles: ['USER'],
      failedLoginCount: 5,
      lockedUntil: new Date(Date.now() + 60_000),
    });

    await expect(
      service.login(
        { email: 'user@example.com', password: 'Glow123!' },
        { ipAddress: null, userAgent: null },
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(repository.createRefreshSession).not.toHaveBeenCalled();
  });

  it('rejects password-reset requests with invalid emails', async () => {
    await expect(
      service.requestPasswordReset('not-an-email'),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});
