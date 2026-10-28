import { Email } from '../src/modules/auth/domain/value-objects/email.vo.js';
import {
  ActionToken,
  ActionTokenPurpose,
  RefreshToken,
  User,
  UserStatus,
} from '../src/modules/auth/domain/entities/index.js';

const id = '00000000-0000-0000-0000-000000000001';
const createdAt = new Date('2026-01-01T00:00:00.000Z');

describe('auth domain entities', () => {
  it('normalizes email addresses for the user entity', () => {
    expect(new Email('  USER@Example.com ').value).toBe('user@example.com');
  });

  it('requires deletedAt to match the user deleted status', () => {
    expect(
      () =>
        new User({
          id,
          email: new Email('user@example.com'),
          passwordHash: 'hashed-password',
          status: UserStatus.Deleted,
          emailVerifiedAt: null,
          tokenVersion: 1,
          failedLoginCount: 0,
          lockedUntil: null,
          lastLoginAt: null,
          createdAt,
          updatedAt: createdAt,
          deletedAt: null,
        }),
    ).toThrow('Deleted users must have deletedAt set');
  });

  it('allows a user without a password hash for external identity sign-in', () => {
    expect(
      () =>
        new User({
          id,
          email: new Email('user@example.com'),
          passwordHash: null,
          status: UserStatus.Active,
          emailVerifiedAt: createdAt,
          tokenVersion: 1,
          failedLoginCount: 0,
          lockedUntil: null,
          lastLoginAt: null,
          createdAt,
          updatedAt: createdAt,
          deletedAt: null,
        }),
    ).not.toThrow();
  });

  it('rejects a refresh token replacement unless the current token is revoked', () => {
    expect(
      () =>
        new RefreshToken({
          id,
          userId: id,
          deviceId: id,
          tokenHash: 'a'.repeat(64),
          tokenFamilyId: id,
          replacedByTokenId: '00000000-0000-0000-0000-000000000002',
          expiresAt: new Date('2026-01-02T00:00:00.000Z'),
          revokedAt: null,
          revokeReason: null,
          ipAddress: null,
          userAgent: null,
          createdAt,
        }),
    ).toThrow('A replaced token must be revoked');
  });

  it('rejects action tokens that are both consumed and revoked', () => {
    expect(
      () =>
        new ActionToken({
          id,
          userId: id,
          purpose: ActionTokenPurpose.VerifyEmail,
          tokenHash: 'b'.repeat(64),
          expiresAt: new Date('2026-01-02T00:00:00.000Z'),
          consumedAt: createdAt,
          revokedAt: createdAt,
          createdAt,
        }),
    ).toThrow('cannot be consumed and revoked at the same time');
  });
});
