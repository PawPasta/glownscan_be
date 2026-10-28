import { Injectable } from '@nestjs/common';
import type { PoolClient } from 'pg';
import { DatabaseService } from '../../../../shared/database/database.service.js';
import type { Uuid } from '../../../../shared/types/domain.types.js';
import type {
  ProfilePort,
  ProfileSnapshot,
  SkinProfileUpdate,
  UserProfileUpdate,
} from '../../application/ports/profile.port.js';

const USER_PROFILE_COLUMNS = {
  fullName: 'full_name',
  dateOfBirth: 'date_of_birth',
  gender: 'gender',
} as const;

const SKIN_PROFILE_COLUMNS = {
  skinType: 'skin_type',
  sensitivityLevel: 'sensitivity_level',
  notes: 'notes',
} as const;

@Injectable()
export class PostgresProfileAdapter implements ProfilePort {
  constructor(private readonly database: DatabaseService) {}

  async getProfile(userId: Uuid): Promise<ProfileSnapshot> {
    await this.database.query(
      `INSERT INTO app_profile.user_profiles (user_id)
       VALUES ($1) ON CONFLICT (user_id) DO NOTHING`,
      [userId],
    );
    const { rows } = await this.database.query<ProfileSnapshot>(
      `SELECT
         json_build_object(
           'id', up.id,
           'userId', up.user_id,
           'fullName', up.full_name,
           'avatarUrl', up.avatar_url,
           'dateOfBirth', up.date_of_birth,
           'gender', up.gender,
           'createdAt', up.created_at,
           'updatedAt', up.updated_at
         ) AS profile,
         CASE WHEN sp.id IS NULL THEN NULL ELSE json_build_object(
           'id', sp.id,
           'skinType', sp.skin_type,
           'sensitivityLevel', sp.sensitivity_level,
           'notes', sp.notes,
           'createdAt', sp.created_at,
           'updatedAt', sp.updated_at
         ) END AS "skinProfile"
       FROM app_profile.user_profiles up
       LEFT JOIN app_profile.skin_profiles sp ON sp.user_profile_id = up.id
       WHERE up.user_id = $1`,
      [userId],
    );
    if (!rows[0]) {
      throw new Error('Profile could not be loaded after creating its row.');
    }
    return rows[0];
  }

  async updateUserProfile(
    userId: Uuid,
    changes: UserProfileUpdate,
  ): Promise<void> {
    const entries = Object.entries(USER_PROFILE_COLUMNS).filter(([key]) =>
      Object.hasOwn(changes, key),
    );
    await this.database.transaction(async (client) => {
      await this.ensureUserProfile(client, userId);
      if (entries.length === 0) {
        return;
      }

      const values = entries.map(
        ([key]) => changes[key as keyof UserProfileUpdate],
      );
      const assignments = entries.map(
        ([, column], index) => `${column} = $${index + 2}`,
      );
      await client.query(
        `UPDATE app_profile.user_profiles
         SET ${assignments.join(', ')}
         WHERE user_id = $1`,
        [userId, ...values],
      );
    });
  }

  async updateSkinProfile(
    userId: Uuid,
    changes: SkinProfileUpdate,
  ): Promise<void> {
    const entries = Object.entries(SKIN_PROFILE_COLUMNS).filter(([key]) =>
      Object.hasOwn(changes, key),
    );
    await this.database.transaction(async (client) => {
      const profileId = await this.ensureUserProfile(client, userId);
      const values = entries.map(
        ([key]) => changes[key as keyof SkinProfileUpdate] ?? null,
      );
      const columns = entries.map(([, column]) => column);
      const placeholders = entries.map((_, index) => `$${index + 2}`);
      const assignments = entries.map(
        ([, column]) => `${column} = EXCLUDED.${column}`,
      );
      await client.query(
        `INSERT INTO app_profile.skin_profiles (user_profile_id${columns.length ? `, ${columns.join(', ')}` : ''})
         VALUES ($1${placeholders.length ? `, ${placeholders.join(', ')}` : ''})
         ON CONFLICT (user_profile_id) DO ${
           assignments.length
             ? `UPDATE SET ${assignments.join(', ')}`
             : 'NOTHING'
         }`,
        [profileId, ...values],
      );
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
      'SELECT id FROM app_profile.user_profiles WHERE user_id = $1',
      [userId],
    );
    if (!rows[0]) {
      throw new Error('Profile row could not be created.');
    }
    return rows[0].id;
  }
}
