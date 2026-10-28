import { Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import type { PoolClient } from 'pg';
import { DatabaseService } from '../../../../shared/database/database.service.js';
import { ActionTokenPurpose } from '../../domain/entities/enums/auth.enums.js';
import { FirebaseAccountConflictError } from '../../application/ports/index.js';
import type {
  ChangePasswordPort,
  AuthUserRecord,
  FirebaseIdentityClaims,
  FirebaseLoginPort,
  LoginPort,
  LogoutPort,
  RefreshSessionPort,
  RegisterAccountPort,
  RegisterUserData,
  RequestPasswordResetPort,
  RefreshSessionData,
  ResendVerificationPort,
  ResetPasswordPort,
  ValidateAccessTokenPort,
  VerifyEmailPort,
} from '../../application/ports/index.js';

@Injectable()
export class PostgresAuthenticationAdapter
  implements
    RegisterAccountPort,
    VerifyEmailPort,
    FirebaseLoginPort,
    ResendVerificationPort,
    LoginPort,
    RefreshSessionPort,
    LogoutPort,
    RequestPasswordResetPort,
    ResetPasswordPort,
    ChangePasswordPort,
    ValidateAccessTokenPort
{
  constructor(private readonly database: DatabaseService) {}

  async registerUser(data: RegisterUserData): Promise<void> {
    await this.database.transaction(async (client) => {
      const { rows } = await client.query<{ id: string }>(
        `INSERT INTO app_auth.users (email, password_hash)
         VALUES ($1, $2)
         RETURNING id`,
        [data.email, data.passwordHash],
      );
      const userId = rows[0].id;

      await client.query(
        `INSERT INTO app_auth.user_roles (user_id, role_id)
         SELECT $1, id FROM app_auth.roles WHERE code = 'USER'`,
        [userId],
      );
      const userRole = await client.query(
        `SELECT 1 FROM app_auth.user_roles ur
         JOIN app_auth.roles r ON r.id = ur.role_id
         WHERE ur.user_id = $1 AND r.code = 'USER'`,
        [userId],
      );
      if (!userRole.rowCount) {
        throw new Error(
          'USER role is missing. Run the database migrations first.',
        );
      }
      await client.query(
        `INSERT INTO app_auth.action_tokens
           (user_id, purpose, token_hash, expires_at)
         VALUES ($1, 'VERIFY_EMAIL', $2, $3)`,
        [userId, data.verificationTokenHash, data.tokenExpiresAt],
      );
    });
  }

  async findUserByEmail(email: string): Promise<AuthUserRecord | null> {
    await this.database.query(
      `UPDATE app_auth.users
       SET status = 'ACTIVE', failed_login_count = 0, locked_until = NULL
       WHERE email = $1 AND status = 'LOCKED'
         AND locked_until <= CURRENT_TIMESTAMP AND deleted_at IS NULL`,
      [email],
    );
    const { rows } = await this.database.query<AuthUserRecord>(
      `${this.userSelect()}
       WHERE u.email = $1 AND u.deleted_at IS NULL
       GROUP BY u.id`,
      [email],
    );
    return rows[0] ?? null;
  }

  async findOrCreateFirebaseUser(
    identity: FirebaseIdentityClaims,
  ): Promise<AuthUserRecord> {
    return this.database.transaction(async (client) => {
      const linkedIdentity = await client.query<{ user_id: string }>(
        `SELECT user_id FROM app_auth.user_providers
         WHERE provider = 'FIREBASE' AND provider_user_id = $1
         FOR UPDATE`,
        [identity.uid],
      );

      let userId = linkedIdentity.rows[0]?.user_id;
      if (!userId) {
        await client.query(
          `UPDATE app_auth.users
           SET status = 'ACTIVE', failed_login_count = 0, locked_until = NULL
           WHERE email = $1 AND status = 'LOCKED'
             AND locked_until <= CURRENT_TIMESTAMP AND deleted_at IS NULL`,
          [identity.email],
        );
        const existingUser = await client.query<{ id: string }>(
          `SELECT id FROM app_auth.users
           WHERE email = $1 AND deleted_at IS NULL
           FOR UPDATE`,
          [identity.email],
        );
        userId = existingUser.rows[0]?.id;

        if (!userId) {
          const createdUser = await client.query<{ id: string }>(
            `INSERT INTO app_auth.users
               (email, password_hash, status, email_verified_at)
             VALUES ($1, NULL, 'ACTIVE', CURRENT_TIMESTAMP)
             RETURNING id`,
            [identity.email],
          );
          userId = createdUser.rows[0].id;
          await client.query(
            `INSERT INTO app_auth.user_roles (user_id, role_id)
             SELECT $1, id FROM app_auth.roles WHERE code = 'USER'`,
            [userId],
          );
          const userRole = await client.query(
            `SELECT 1 FROM app_auth.user_roles ur
             JOIN app_auth.roles r ON r.id = ur.role_id
             WHERE ur.user_id = $1 AND r.code = 'USER'`,
            [userId],
          );
          if (!userRole.rowCount) {
            throw new Error(
              'USER role is missing. Run the database migrations first.',
            );
          }
        }
      }

      if (linkedIdentity.rows[0]) {
        await client.query(
          `UPDATE app_auth.users
           SET status = 'ACTIVE', failed_login_count = 0, locked_until = NULL
           WHERE id = $1 AND status = 'LOCKED'
             AND locked_until <= CURRENT_TIMESTAMP AND deleted_at IS NULL`,
          [userId],
        );
      }

      const user = await this.findUserByIdWithClient(client, userId);
      if (!user) {
        throw new FirebaseAccountConflictError();
      }
      if (
        user.status !== 'ACTIVE' &&
        user.status !== 'PENDING_VERIFICATION'
      ) {
        return user;
      }

      await client.query(
        `UPDATE app_auth.users
         SET email = $2, status = 'ACTIVE',
             email_verified_at = COALESCE(email_verified_at, CURRENT_TIMESTAMP),
             failed_login_count = 0, locked_until = NULL
         WHERE id = $1`,
        [userId, identity.email],
      );

      const provider = await client.query(
        `INSERT INTO app_auth.user_providers
           (user_id, provider, provider_user_id, sign_in_provider,
            provider_email, email_verified, display_name, photo_url, provider_data,
            last_authenticated_at)
         VALUES ($1, 'FIREBASE', $2, $3, $4, TRUE, $5, $6, $7::jsonb,
                 CURRENT_TIMESTAMP)
         ON CONFLICT (provider, provider_user_id)
         DO UPDATE SET
           sign_in_provider = EXCLUDED.sign_in_provider,
           provider_email = EXCLUDED.provider_email,
           email_verified = TRUE,
           display_name = EXCLUDED.display_name,
           photo_url = EXCLUDED.photo_url,
           provider_data = EXCLUDED.provider_data,
           last_authenticated_at = CURRENT_TIMESTAMP
         WHERE app_auth.user_providers.user_id = EXCLUDED.user_id
         RETURNING user_id`,
        [
          userId,
          identity.uid,
          identity.signInProvider,
          identity.email,
          identity.name,
          identity.picture,
          JSON.stringify(identity.providerData),
        ],
      );
      if (!provider.rowCount) {
        throw new FirebaseAccountConflictError();
      }

      await client.query(
        `INSERT INTO app_profile.user_profiles (user_id, full_name, avatar_url)
         VALUES ($1, LEFT(NULLIF(BTRIM($2), ''), 150), $3)
         ON CONFLICT (user_id) DO UPDATE SET
           full_name = COALESCE(app_profile.user_profiles.full_name, EXCLUDED.full_name),
           avatar_url = COALESCE(app_profile.user_profiles.avatar_url, EXCLUDED.avatar_url)`,
        [userId, identity.name, identity.picture],
      );

      const updatedUser = await this.findUserByIdWithClient(client, userId);
      if (!updatedUser) {
        throw new Error('Firebase user could not be loaded after linking.');
      }
      return updatedUser;
    });
  }

  async findUserById(userId: string): Promise<AuthUserRecord | null> {
    const { rows } = await this.database.query<AuthUserRecord>(
      `${this.userSelect()}
       WHERE u.id = $1 AND u.deleted_at IS NULL
       GROUP BY u.id`,
      [userId],
    );
    return rows[0] ?? null;
  }

  async recordFailedLogin(email: string): Promise<void> {
    await this.database.query(
      `UPDATE app_auth.users
       SET failed_login_count = failed_login_count + 1,
           status = CASE WHEN failed_login_count + 1 >= 5 THEN 'LOCKED' ELSE status END,
           locked_until = CASE
             WHEN failed_login_count + 1 >= 5 THEN CURRENT_TIMESTAMP + INTERVAL '15 minutes'
             ELSE locked_until
           END
       WHERE email = $1 AND status = 'ACTIVE' AND deleted_at IS NULL`,
      [email],
    );
  }

  async clearFailedLogins(userId: string): Promise<void> {
    await this.database.query(
      `UPDATE app_auth.users
       SET failed_login_count = 0, locked_until = NULL
       WHERE id = $1 AND status = 'ACTIVE'`,
      [userId],
    );
  }

  async verifyEmail(email: string, tokenHash: string): Promise<boolean> {
    return this.database.transaction(async (client) => {
      const token = await client.query<{ id: string; user_id: string }>(
        `SELECT t.id, t.user_id
         FROM app_auth.action_tokens t
         JOIN app_auth.users u ON u.id = t.user_id
         WHERE u.email = $1 AND t.token_hash = $2
           AND t.purpose = 'VERIFY_EMAIL'
           AND t.consumed_at IS NULL AND t.revoked_at IS NULL
           AND t.expires_at > CURRENT_TIMESTAMP
         FOR UPDATE OF t`,
        [email, tokenHash],
      );
      if (!token.rowCount) {
        return false;
      }

      await client.query(
        `UPDATE app_auth.action_tokens SET consumed_at = CURRENT_TIMESTAMP
         WHERE id = $1`,
        [token.rows[0].id],
      );
      await client.query(
        `UPDATE app_auth.users
         SET status = 'ACTIVE', email_verified_at = CURRENT_TIMESTAMP
         WHERE id = $1 AND status = 'PENDING_VERIFICATION'`,
        [token.rows[0].user_id],
      );
      return true;
    });
  }

  async resendVerificationToken(
    userId: string,
    tokenHash: string,
    expiresAt: Date,
  ): Promise<void> {
    await this.database.transaction(async (client) => {
      const user = await client.query(
        `SELECT id FROM app_auth.users
         WHERE id = $1 AND status = 'PENDING_VERIFICATION'
           AND deleted_at IS NULL
         FOR UPDATE`,
        [userId],
      );
      if (!user.rowCount) {
        return;
      }
      await client.query(
        `UPDATE app_auth.action_tokens
         SET revoked_at = CURRENT_TIMESTAMP
         WHERE user_id = $1 AND purpose = 'VERIFY_EMAIL'
           AND consumed_at IS NULL AND revoked_at IS NULL`,
        [userId],
      );
      await client.query(
        `INSERT INTO app_auth.action_tokens
           (user_id, purpose, token_hash, expires_at)
         VALUES ($1, 'VERIFY_EMAIL', $2, $3)`,
        [userId, tokenHash, expiresAt],
      );
    });
  }

  async createActionToken(
    userId: string,
    purpose: ActionTokenPurpose,
    tokenHash: string,
    expiresAt: Date,
  ): Promise<void> {
    await this.database.transaction(async (client) => {
      await client.query(
        `UPDATE app_auth.action_tokens
         SET revoked_at = CURRENT_TIMESTAMP
         WHERE user_id = $1 AND purpose = $2
           AND consumed_at IS NULL AND revoked_at IS NULL`,
        [userId, purpose],
      );
      await client.query(
        `INSERT INTO app_auth.action_tokens
           (user_id, purpose, token_hash, expires_at)
         VALUES ($1, $2, $3, $4)`,
        [userId, purpose, tokenHash, expiresAt],
      );
    });
  }

  async resetPassword(
    email: string,
    tokenHash: string,
    passwordHash: string,
  ): Promise<boolean> {
    return this.database.transaction(async (client) => {
      const token = await client.query<{ id: string; user_id: string }>(
        `SELECT t.id, t.user_id
         FROM app_auth.action_tokens t
         JOIN app_auth.users u ON u.id = t.user_id
         WHERE u.email = $1 AND t.token_hash = $2
           AND t.purpose = 'RESET_PASSWORD'
           AND t.consumed_at IS NULL AND t.revoked_at IS NULL
           AND t.expires_at > CURRENT_TIMESTAMP
           AND u.status <> 'DELETED' AND u.deleted_at IS NULL
         FOR UPDATE OF t`,
        [email, tokenHash],
      );
      if (!token.rowCount) {
        return false;
      }

      const userId = token.rows[0].user_id;
      await client.query(
        `UPDATE app_auth.action_tokens SET consumed_at = CURRENT_TIMESTAMP
         WHERE id = $1`,
        [token.rows[0].id],
      );
      await client.query(
        `UPDATE app_auth.users
         SET password_hash = $1, token_version = token_version + 1
         WHERE id = $2`,
        [passwordHash, userId],
      );
      await this.revokeAllRefreshTokens(client, userId, 'PASSWORD_RESET');
      return true;
    });
  }

  async changePassword(
    userId: string,
    currentPasswordHash: string,
    newPasswordHash: string,
  ): Promise<boolean> {
    return this.database.transaction(async (client) => {
      const result = await client.query(
        `UPDATE app_auth.users
         SET password_hash = $1, token_version = token_version + 1
         WHERE id = $2 AND password_hash = $3
           AND status = 'ACTIVE' AND deleted_at IS NULL`,
        [newPasswordHash, userId, currentPasswordHash],
      );
      if (!result.rowCount) {
        return false;
      }
      await this.revokeAllRefreshTokens(client, userId, 'PASSWORD_CHANGED');
      return true;
    });
  }

  async createRefreshSession(data: RefreshSessionData): Promise<void> {
    await this.database.transaction(async (client) => {
      const deviceId = randomUUID();
      await client.query(
        `INSERT INTO app_auth.user_devices
           (id, user_id, device_uuid, platform)
         VALUES ($1, $2, $3, $4)
         ON CONFLICT (user_id, device_uuid)
         DO UPDATE SET last_active_at = CURRENT_TIMESTAMP
         RETURNING id`,
        [deviceId, data.userId, data.deviceUuid, data.platform],
      );
      const device = await client.query<{ id: string }>(
        `SELECT id FROM app_auth.user_devices
         WHERE user_id = $1 AND device_uuid = $2`,
        [data.userId, data.deviceUuid],
      );
      await client.query(
        `INSERT INTO app_auth.refresh_tokens
           (user_id, device_id, token_hash, token_family_id, expires_at, ip_address, user_agent)
         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [
          data.userId,
          device.rows[0].id,
          data.tokenHash,
          data.familyId,
          data.expiresAt,
          data.ipAddress,
          data.userAgent,
        ],
      );
    });
  }

  async rotateRefreshToken(
    oldTokenHash: string,
    newTokenHash: string,
    expiresAt: Date,
    userId: string,
  ): Promise<AuthUserRecord | null> {
    return this.database.transaction(async (client) => {
      const { rows } = await client.query<{
        id: string;
        user_id: string;
        device_id: string;
        token_family_id: string;
        expires_at: Date;
        revoked_at: Date | null;
      }>(
        `SELECT id, user_id, device_id, token_family_id, expires_at, revoked_at
         FROM app_auth.refresh_tokens
         WHERE token_hash = $1 AND user_id = $2
         FOR UPDATE`,
        [oldTokenHash, userId],
      );
      const current = rows[0];
      if (!current) {
        return null;
      }

      if (current.revoked_at) {
        await client.query(
          `UPDATE app_auth.refresh_tokens
           SET revoked_at = COALESCE(revoked_at, CURRENT_TIMESTAMP),
               revoke_reason = COALESCE(revoke_reason, 'TOKEN_REUSE')
           WHERE token_family_id = $1 AND revoked_at IS NULL`,
          [current.token_family_id],
        );
        return null;
      }
      if (new Date(current.expires_at) <= new Date()) {
        await client.query(
          `UPDATE app_auth.refresh_tokens
           SET revoked_at = CURRENT_TIMESTAMP, revoke_reason = 'EXPIRED'
           WHERE id = $1`,
          [current.id],
        );
        return null;
      }

      await client.query(
        `UPDATE app_auth.refresh_tokens
         SET revoked_at = CURRENT_TIMESTAMP, revoke_reason = 'ROTATED'
         WHERE id = $1`,
        [current.id],
      );
      const replacementId = randomUUID();
      await client.query(
        `INSERT INTO app_auth.refresh_tokens
           (id, user_id, device_id, token_hash, token_family_id, expires_at, ip_address, user_agent)
         SELECT $1, user_id, device_id, $2, token_family_id, $3, ip_address, user_agent
         FROM app_auth.refresh_tokens WHERE id = $4`,
        [replacementId, newTokenHash, expiresAt, current.id],
      );
      await client.query(
        `UPDATE app_auth.refresh_tokens SET replaced_by_token_id = $1
         WHERE id = $2`,
        [replacementId, current.id],
      );
      const user = await this.findUserByIdWithClient(client, current.user_id);
      if (!user || user.status !== 'ACTIVE') {
        await client.query(
          `UPDATE app_auth.refresh_tokens
           SET revoked_at = CURRENT_TIMESTAMP, revoke_reason = 'ACCOUNT_INACTIVE'
           WHERE token_family_id = $1 AND revoked_at IS NULL`,
          [current.token_family_id],
        );
        return null;
      }
      return user;
    });
  }

  async revokeRefreshToken(tokenHash: string): Promise<void> {
    await this.database.transaction(async (client) => {
      const token = await client.query<{ token_family_id: string }>(
        `SELECT token_family_id FROM app_auth.refresh_tokens
         WHERE token_hash = $1 FOR UPDATE`,
        [tokenHash],
      );
      if (token.rowCount) {
        await client.query(
          `UPDATE app_auth.refresh_tokens
           SET revoked_at = CURRENT_TIMESTAMP, revoke_reason = 'LOGOUT'
           WHERE token_family_id = $1 AND revoked_at IS NULL`,
          [token.rows[0].token_family_id],
        );
      }
    });
  }

  private async revokeAllRefreshTokens(
    client: PoolClient,
    userId: string,
    reason: string,
  ): Promise<void> {
    await client.query(
      `UPDATE app_auth.refresh_tokens
       SET revoked_at = CURRENT_TIMESTAMP, revoke_reason = $2
       WHERE user_id = $1 AND revoked_at IS NULL`,
      [userId, reason],
    );
  }

  private async findUserByIdWithClient(
    client: PoolClient,
    userId: string,
  ): Promise<AuthUserRecord | null> {
    const { rows } = await client.query<AuthUserRecord>(
      `${this.userSelect()}
       WHERE u.id = $1 AND u.deleted_at IS NULL
       GROUP BY u.id`,
      [userId],
    );
    return rows[0] ?? null;
  }

  private userSelect(): string {
    return `SELECT u.id, u.email, u.password_hash AS "passwordHash",
              u.status, u.token_version AS "tokenVersion",
              u.failed_login_count AS "failedLoginCount",
              u.locked_until AS "lockedUntil",
              COALESCE(array_agg(DISTINCT r.code) FILTER (WHERE r.code IS NOT NULL), '{}') AS roles
            FROM app_auth.users u
            LEFT JOIN app_auth.user_roles ur ON ur.user_id = u.id
            LEFT JOIN app_auth.roles r ON r.id = ur.role_id`;
  }
}
