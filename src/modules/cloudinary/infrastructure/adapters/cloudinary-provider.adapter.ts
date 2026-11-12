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
}
