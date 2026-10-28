import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ConfigService } from '@nestjs/config';
import type { PoolClient } from 'pg';
import { DatabaseService } from '../src/shared/database/database.service.js';
import type { UploadIntentPort } from '../src/modules/cloudinary/application/ports/upload-intent.port.js';
import { CloudinaryUploadIntentService } from '../src/modules/cloudinary/application/use-case/cloudinary-upload-intent.service.js';
import { PostgresUploadIntentAdapter } from '../src/modules/cloudinary/infrastructure/adapters/postgres-upload-intent.adapter.js';
import {
  isExpectedCloudinaryUrl,
  signCloudinaryParams,
  verifyCloudinarySignature,
} from '../src/modules/cloudinary/infrastructure/cloudinary-signature.js';

describe('Cloudinary signature helpers', () => {
  it('signs parameters in canonical key order and validates the response', () => {
    const parameters = { version: 123, public_id: 'glownscan/avatar/user-id' };
    const signature = signCloudinaryParams(parameters, 'secret');

    expect(signature).toMatch(/^[a-f0-9]{40}$/);
    expect(verifyCloudinarySignature(parameters, signature, 'secret')).toBe(
      true,
    );
    expect(
      verifyCloudinarySignature(parameters, signature, 'wrong-secret'),
    ).toBe(false);
    expect(
      verifyCloudinarySignature(parameters, 'not-a-signature', 'secret'),
    ).toBe(false);
  });

  it('accepts only the expected HTTPS Cloudinary asset URL', () => {
    expect(
      isExpectedCloudinaryUrl(
        'https://res.cloudinary.com/demo/image/upload/v123/glownscan/avatar.jpg',
        'demo',
        'glownscan/avatar',
        123,
      ),
    ).toBe(true);
    expect(
      isExpectedCloudinaryUrl(
        'https://example.com/demo/image/upload/v123/glownscan/avatar.jpg',
        'demo',
        'glownscan/avatar',
        123,
      ),
    ).toBe(false);
    expect(
      isExpectedCloudinaryUrl(
        'https://res.cloudinary.com/demo/image/upload/v124/glownscan/avatar.jpg',
        'demo',
        'glownscan/avatar',
        123,
      ),
    ).toBe(false);
  });
});

describe('CloudinaryUploadIntentService', () => {
  const userId = 'c0a80101-0000-4000-8000-000000000001';
  let port: UploadIntentPort;
  let service: CloudinaryUploadIntentService;
  let config: ConfigService;
  let createAvatarUploadIntent: ReturnType<
    typeof vi.fn<UploadIntentPort['createAvatarIntent']>
  >;
  let completeAvatarUpload: ReturnType<
    typeof vi.fn<UploadIntentPort['consumeAvatarIntent']>
  >;

  beforeEach(() => {
    createAvatarUploadIntent = vi.fn<UploadIntentPort['createAvatarIntent']>();
    completeAvatarUpload = vi.fn<UploadIntentPort['consumeAvatarIntent']>();
    port = {
      createAvatarIntent: createAvatarUploadIntent,
      consumeAvatarIntent: completeAvatarUpload,
    };
    config = new ConfigService({
      GLOWNSCAN_CLOUDINARY_CLOUD_NAME: 'demo',
      GLOWNSCAN_CLOUDINARY_API_KEY: 'api-key',
      GLOWNSCAN_CLOUDINARY_API_SECRET: 'api-secret',
    });
    service = new CloudinaryUploadIntentService(port, config);
  });

  it('creates a per-user signed upload intent and persists its expiry', async () => {
    const result = await service.createAvatarUploadIntent(userId);

    expect(result.publicId).toMatch(
      new RegExp(`^glownscan/avatars/${userId}/[0-9a-f-]{36}$`),
    );
    expect(result).toMatchObject({
      apiKey: 'api-key',
      cloudName: 'demo',
      signature: expect.stringMatching(/^[a-f0-9]{40}$/),
    });
    expect(createAvatarUploadIntent).toHaveBeenCalledWith(
      userId,
      result.publicId,
      expect.any(Date),
    );
    const expiresAt = createAvatarUploadIntent.mock.calls[0][2];
    expect(expiresAt.getTime()).toBeGreaterThan(Date.now());
    expect(expiresAt.getTime()).toBeLessThanOrEqual(
      Date.now() + 10 * 60 * 1000,
    );
  });

  it('only confirms a valid signed asset matching its upload intent', async () => {
    const publicId = `glownscan/avatars/${userId}/8a875514-1150-48d2-8d90-b2d55c9c8820`;
    const signature = signCloudinaryParams(
      { public_id: publicId, version: 123 },
      'api-secret',
    );
    completeAvatarUpload.mockResolvedValue(true);

    await expect(
      service.confirmAvatarUpload(userId, {
        publicId,
        version: 123,
        signature,
        secureUrl: `https://res.cloudinary.com/demo/image/upload/v123/${publicId}.jpg`,
      }),
    ).resolves.toBeUndefined();
    expect(completeAvatarUpload).toHaveBeenCalledWith(
      userId,
      publicId,
      `https://res.cloudinary.com/demo/image/upload/v123/${publicId}.jpg`,
    );
  });

  it('rejects invalid Cloudinary signatures before consuming an intent', async () => {
    await expect(
      service.confirmAvatarUpload(userId, {
        publicId: `glownscan/avatars/${userId}/8a875514-1150-48d2-8d90-b2d55c9c8820`,
        version: 123,
        signature: '0'.repeat(40),
        secureUrl:
          'https://res.cloudinary.com/demo/image/upload/v123/glownscan/avatars/photo.jpg',
      }),
    ).rejects.toThrow('Cloudinary upload response is invalid.');
    expect(completeAvatarUpload).not.toHaveBeenCalled();
  });

  it('rejects a valid upload response when the database intent is missing', async () => {
    completeAvatarUpload.mockResolvedValue(false);
    const publicId = `glownscan/avatars/${userId}/8a875514-1150-48d2-8d90-b2d55c9c8820`;
    const signature = signCloudinaryParams(
      { public_id: publicId, version: 123 },
      'api-secret',
    );

    await expect(
      service.confirmAvatarUpload(userId, {
        publicId,
        version: 123,
        signature,
        secureUrl: `https://res.cloudinary.com/demo/image/upload/v123/${publicId}.jpg`,
      }),
    ).rejects.toThrow('Avatar upload intent is invalid or expired.');
  });
});

describe('PostgresUploadIntentAdapter', () => {
  const userId = 'c0a80101-0000-4000-8000-000000000001';
  const profileId = 'b0a80101-0000-4000-8000-000000000001';
  const intentId = 'd0a80101-0000-4000-8000-000000000001';

  function createAdapter(query: ReturnType<typeof vi.fn>) {
    const client = { query } as unknown as PoolClient;
    const database = {
      transaction: <T>(work: (client: PoolClient) => Promise<T>) =>
        work(client),
    } as unknown as DatabaseService;
    return { adapter: new PostgresUploadIntentAdapter(database), query };
  }

  it('stores only intent metadata in app_cloudinary.upload_intents', async () => {
    const { adapter, query } = createAdapter(
      vi
        .fn()
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [{ id: profileId }] })
        .mockResolvedValue({ rows: [], rowCount: 1 }),
    );
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000);
    const publicId = `glownscan/avatars/${userId}/8a875514-1150-48d2-8d90-b2d55c9c8820`;

    await adapter.createAvatarIntent(userId, publicId, expiresAt);

    expect(query).toHaveBeenCalledWith(
      expect.stringContaining('UPDATE app_cloudinary.upload_intents'),
      [userId],
    );
    expect(query).toHaveBeenCalledWith(
      expect.stringContaining(
        'INSERT INTO app_cloudinary.upload_intents\n           (user_id, public_id, expires_at)',
      ),
      [userId, publicId, expiresAt],
    );
    expect(
      query.mock.calls.some(([sql]) =>
        String(sql).includes('secure_url'),
      ),
    ).toBe(false);
  });

  it('consumes the intent and updates avatar_url in the same transaction', async () => {
    const { adapter, query } = createAdapter(
      vi
        .fn()
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [{ id: profileId }] })
        .mockResolvedValueOnce({ rows: [{ id: intentId }] })
        .mockResolvedValueOnce({ rows: [], rowCount: 1 })
        .mockResolvedValueOnce({ rows: [], rowCount: 1 }),
    );
    const publicId = `glownscan/avatars/${userId}/8a875514-1150-48d2-8d90-b2d55c9c8820`;
    const secureUrl =
      `https://res.cloudinary.com/demo/image/upload/v123/${publicId}.jpg`;

    await expect(
      adapter.consumeAvatarIntent(userId, publicId, secureUrl),
    ).resolves.toBe(true);

    expect(query).toHaveBeenCalledWith(
      expect.stringContaining('FROM app_cloudinary.upload_intents'),
      [userId, publicId],
    );
    expect(query).toHaveBeenCalledWith(
      expect.stringContaining('SET consumed_at = CURRENT_TIMESTAMP'),
      [intentId],
    );
    expect(query).toHaveBeenCalledWith(
      expect.stringContaining('UPDATE app_profile.user_profiles'),
      [profileId, secureUrl],
    );
  });

  it('does not update the profile when no active intent matches the user', async () => {
    const { adapter, query } = createAdapter(
      vi
        .fn()
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [{ id: profileId }] })
        .mockResolvedValueOnce({ rows: [] }),
    );
    const publicId = `glownscan/avatars/${userId}/8a875514-1150-48d2-8d90-b2d55c9c8820`;

    await expect(
      adapter.consumeAvatarIntent(
        userId,
        publicId,
        'https://res.cloudinary.com/demo/image/upload/v123/avatar.jpg',
      ),
    ).resolves.toBe(false);
    expect(
      query.mock.calls.some(([sql]) =>
        String(sql).includes('UPDATE app_profile.user_profiles'),
      ),
    ).toBe(false);
  });
});
