import { Inject, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomUUID } from 'node:crypto';
import {
  BadRequestException,
  NotFoundException,
} from '../../../../shared/handler/http.exceptions.js';
import type { Uuid } from '../../../../shared/types/domain.types.js';
import {
  UPLOAD_INTENT_PORT,
  type CloudinaryUploadPurpose,
  type UploadIntentPort,
} from '../ports/upload-intent.port.js';
import {
  isExpectedCloudinaryUrl,
  signCloudinaryParams,
  verifyCloudinarySignature,
} from '../../infrastructure/cloudinary-signature.js';

export interface CloudinaryUploadConfirmation {
  publicId: string;
  version: number;
  signature: string;
  secureUrl: string;
}

@Injectable()
export class CloudinaryUploadIntentService {
  private static readonly INTENT_TTL_MS = 10 * 60 * 1000;

  constructor(
    @Inject(UPLOAD_INTENT_PORT)
    private readonly uploadIntentPort: UploadIntentPort,
    private readonly config: ConfigService,
  ) {}

  async createAvatarUploadIntent(userId: Uuid): Promise<{
    publicId: string;
    timestamp: number;
    signature: string;
    apiKey: string;
    cloudName: string;
  }> {
    return this.createUploadIntent(userId, 'AVATAR');
  }

  async createSkinAnalysisUploadIntent(userId: Uuid): Promise<{
    publicId: string;
    timestamp: number;
    signature: string;
    apiKey: string;
    cloudName: string;
  }> {
    return this.createUploadIntent(userId, 'SKIN_ANALYSIS');
  }

  private async createUploadIntent(
    userId: Uuid,
    purpose: CloudinaryUploadPurpose,
  ): Promise<{
    publicId: string;
    timestamp: number;
    signature: string;
    apiKey: string;
    cloudName: string;
  }> {
    const cloudName = this.config.getOrThrow<string>(
      'GLOWNSCAN_CLOUDINARY_CLOUD_NAME',
    );
    const apiKey = this.config.getOrThrow<string>(
      'GLOWNSCAN_CLOUDINARY_API_KEY',
    );
    const apiSecret = this.config.getOrThrow<string>(
      'GLOWNSCAN_CLOUDINARY_API_SECRET',
    );
    const timestamp = Math.floor(Date.now() / 1000);
    const folder = purpose === 'AVATAR' ? 'avatars' : 'skin-analysis';
    const publicId = `glownscan/${folder}/${userId}/${randomUUID()}`;
    const expiresAt = new Date(
      timestamp * 1000 + CloudinaryUploadIntentService.INTENT_TTL_MS,
    );
    const signature = signCloudinaryParams(
      { public_id: publicId, timestamp },
      apiSecret,
    );

    await this.uploadIntentPort.createIntent(
      userId,
      purpose,
      publicId,
      expiresAt,
    );
    return { publicId, timestamp, signature, apiKey, cloudName };
  }

  async confirmAvatarUpload(
    userId: Uuid,
    input: CloudinaryUploadConfirmation,
  ): Promise<void> {
    this.assertValidUploadResponse(userId, 'AVATAR', input);

    const consumed = await this.uploadIntentPort.consumeAvatarIntent(
      userId,
      input.publicId,
      input.secureUrl,
    );
    if (!consumed) {
      throw new NotFoundException(
        'Avatar upload intent is invalid or expired.',
      );
    }
  }

  async confirmSkinAnalysisUpload(
    userId: Uuid,
    input: CloudinaryUploadConfirmation,
  ): Promise<string> {
    this.assertValidUploadResponse(userId, 'SKIN_ANALYSIS', input);
    const consumed = await this.uploadIntentPort.consumeIntent(
      userId,
      'SKIN_ANALYSIS',
      input.publicId,
    );
    if (!consumed) {
      throw new NotFoundException(
        'Skin analysis upload intent is invalid or expired.',
      );
    }
    return input.secureUrl;
  }

  private assertValidUploadResponse(
    userId: Uuid,
    purpose: CloudinaryUploadPurpose,
    input: CloudinaryUploadConfirmation,
  ): void {
    const cloudName = this.config.getOrThrow<string>(
      'GLOWNSCAN_CLOUDINARY_CLOUD_NAME',
    );
    const apiSecret = this.config.getOrThrow<string>(
      'GLOWNSCAN_CLOUDINARY_API_SECRET',
    );
    const folder = purpose === 'AVATAR' ? 'avatars' : 'skin-analysis';
    const publicIdPrefix = `glownscan/${folder}/${userId}/`;
    const imageId = input.publicId.startsWith(publicIdPrefix)
      ? input.publicId.slice(publicIdPrefix.length)
      : '';
    if (
      !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
        imageId,
      ) ||
      !verifyCloudinarySignature(
        { public_id: input.publicId, version: input.version },
        input.signature,
        apiSecret,
      ) ||
      !isExpectedCloudinaryUrl(
        input.secureUrl,
        cloudName,
        input.publicId,
        input.version,
      )
    ) {
      throw new BadRequestException('Cloudinary upload response is invalid.');
    }
  }
}
