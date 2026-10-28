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
  type UploadIntentPort,
} from '../ports/upload-intent.port.js';
import {
  isExpectedCloudinaryUrl,
  signCloudinaryParams,
  verifyCloudinarySignature,
} from '../../infrastructure/cloudinary-signature.js';

interface AvatarUploadConfirmation {
  publicId: string;
  version: number;
  signature: string;
  secureUrl: string;
}

@Injectable()
export class CloudinaryUploadIntentService {
  private static readonly AVATAR_INTENT_TTL_MS = 10 * 60 * 1000;

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
    const publicId = `glownscan/avatars/${userId}/${randomUUID()}`;
    const expiresAt = new Date(
      timestamp * 1000 + CloudinaryUploadIntentService.AVATAR_INTENT_TTL_MS,
    );
    const signature = signCloudinaryParams(
      { public_id: publicId, timestamp },
      apiSecret,
    );

    await this.uploadIntentPort.createAvatarIntent(
      userId,
      publicId,
      expiresAt,
    );
    return { publicId, timestamp, signature, apiKey, cloudName };
  }

  async confirmAvatarUpload(
    userId: Uuid,
    input: AvatarUploadConfirmation,
  ): Promise<void> {
    const cloudName = this.config.getOrThrow<string>(
      'GLOWNSCAN_CLOUDINARY_CLOUD_NAME',
    );
    const apiSecret = this.config.getOrThrow<string>(
      'GLOWNSCAN_CLOUDINARY_API_SECRET',
    );
    if (
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
}
