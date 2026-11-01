import { Injectable } from '@nestjs/common';
import type { PoolClient } from 'pg';
import { DatabaseService } from '../../../../shared/database/database.service.js';
import type { Uuid } from '../../../../shared/types/domain.types.js';
import type {
  CloudinaryUploadPurpose,
  UploadIntentPort,
} from '../../application/ports/upload-intent.port.js';

@Injectable()
export class PostgresUploadIntentAdapter implements UploadIntentPort {
  constructor(private readonly database: DatabaseService) {}

  async createIntent(
    userId: Uuid,
    purpose: CloudinaryUploadPurpose,
    publicId: string,
    expiresAt: Date,
  ): Promise<void> {
    await this.database.transaction(async (client) => {
      await client.query(
        `UPDATE app_cloudinary.upload_intents
         SET revoked_at = CURRENT_TIMESTAMP
         WHERE user_id = $1 AND purpose = $2
           AND consumed_at IS NULL AND revoked_at IS NULL`,
        [userId, purpose],
      );
      await client.query(
        `INSERT INTO app_cloudinary.upload_intents
           (user_id, purpose, public_id, expires_at)
         VALUES ($1, $2, $3, $4)`,
        [userId, purpose, publicId, expiresAt],
      );
    });
  }

  async consumeIntent(
    userId: Uuid,
    purpose: CloudinaryUploadPurpose,
    publicId: string,
  ): Promise<boolean> {
    const result = await this.database.query(
      `UPDATE app_cloudinary.upload_intents
       SET consumed_at = CURRENT_TIMESTAMP
       WHERE user_id = $1 AND purpose = $2 AND public_id = $3
         AND consumed_at IS NULL AND revoked_at IS NULL
         AND expires_at > CURRENT_TIMESTAMP`,
      [userId, purpose, publicId],
    );
    return result.rowCount === 1;
  }

  async consumeAvatarIntent(
    userId: Uuid,
    publicId: string,
    secureUrl: string,
  ): Promise<boolean> {
    return this.database.transaction(async (client) => {
      const profileId = await this.ensureUserProfile(client, userId);
      const { rows } = await client.query<{ id: Uuid }>(
        `SELECT id
         FROM app_cloudinary.upload_intents
         WHERE user_id = $1 AND purpose = 'AVATAR' AND public_id = $2
           AND consumed_at IS NULL AND revoked_at IS NULL
           AND expires_at > CURRENT_TIMESTAMP
         FOR UPDATE`,
        [userId, publicId],
      );
      const intent = rows[0];
      if (!intent) {
        return false;
      }

      const consumed = await client.query(
        `UPDATE app_cloudinary.upload_intents
         SET consumed_at = CURRENT_TIMESTAMP
         WHERE id = $1 AND consumed_at IS NULL AND revoked_at IS NULL
           AND expires_at > CURRENT_TIMESTAMP`,
        [intent.id],
      );
      if (consumed.rowCount !== 1) {
        return false;
      }

      await client.query(
        `UPDATE app_profile.user_profiles
         SET avatar_url = $2
         WHERE id = $1`,
        [profileId, secureUrl],
      );
      return true;
    });
  }

  private async ensureUserProfile(
    client: PoolClient,
    userId: Uuid,
  ): Promise<Uuid> {
    await client.query(
      `INSERT INTO app_profile.user_profiles (user_id)
       VALUES ($1) ON CONFLICT (user_id) DO NOTHING`,
      [userId],
    );
    const { rows } = await client.query<{ id: Uuid }>(
      'SELECT id FROM app_profile.user_profiles WHERE user_id = $1 FOR UPDATE',
      [userId],
    );
    if (!rows[0]) {
      throw new Error('Profile row could not be created.');
    }
    return rows[0].id;
  }
}
