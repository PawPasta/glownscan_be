import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  isExpectedCloudinaryUrl,
  signCloudinaryParams,
  verifyCloudinarySignature,
} from '../cloudinary-signature.js';
import type { CloudinaryProviderPort } from '../../application/ports/cloudinary-provider.port.js';

@Injectable()
export class CloudinaryProviderAdapter implements CloudinaryProviderPort {
  constructor(private readonly config: ConfigService) {}

  getUploadCredentials() {
    return {
      cloudName: this.config.getOrThrow<string>(
        'GLOWNSCAN_CLOUDINARY_CLOUD_NAME',
      ),
      apiKey: this.config.getOrThrow<string>('GLOWNSCAN_CLOUDINARY_API_KEY'),
      apiSecret: this.config.getOrThrow<string>(
        'GLOWNSCAN_CLOUDINARY_API_SECRET',
      ),
    };
  }

  sign(params: Record<string, string | number>, apiSecret: string) {
    return signCloudinaryParams(params, apiSecret);
  }

  verify(
    params: Record<string, string | number>,
    signature: string,
    apiSecret: string,
  ) {
    return verifyCloudinarySignature(params, signature, apiSecret);
  }

  isExpectedImageUrl(
    secureUrl: string,
    cloudName: string,
    publicId: string,
    version: number,
  ) {
    return isExpectedCloudinaryUrl(secureUrl, cloudName, publicId, version);
  }

  async deleteImage(publicId: string): Promise<void> {
    const { cloudName, apiKey, apiSecret } = this.getUploadCredentials();
    const timestamp = Math.floor(Date.now() / 1000);
    const signature = this.sign({ public_id: publicId, timestamp }, apiSecret);
    const form = new URLSearchParams({
      public_id: publicId,
      timestamp: String(timestamp),
      api_key: apiKey,
      signature,
    });
    const response = await fetch(
      `https://api.cloudinary.com/v1_1/${encodeURIComponent(cloudName)}/image/destroy`,
      { method: 'POST', body: form, signal: AbortSignal.timeout(10_000) },
    );
    if (!response.ok) throw new Error('Cloudinary image deletion failed.');
    const result: unknown = await response.json();
    if (
      !result ||
      typeof result !== 'object' ||
      !['ok', 'not found'].includes(
        String((result as { result?: unknown }).result),
      )
    )
      throw new Error('Cloudinary image deletion was not confirmed.');
  }
}
