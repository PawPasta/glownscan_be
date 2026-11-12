import type { Uuid } from '../../../../shared/types/domain.types.js';
import type { CloudinaryUploadPurpose } from '../../domain/entities/upload-intent.entity.js';

export type { CloudinaryUploadPurpose } from '../../domain/entities/upload-intent.entity.js';

export interface UploadIntentPort {
  createIntent(
    userId: Uuid,
    purpose: CloudinaryUploadPurpose,
    publicId: string,
    expiresAt: Date,
  ): Promise<void>;
  consumeIntent(
    userId: Uuid,
    purpose: CloudinaryUploadPurpose,
    publicId: string,
  ): Promise<boolean>;
  consumeAvatarIntent(
    userId: Uuid,
    publicId: string,
    secureUrl: string,
  ): Promise<boolean>;
}

export const UPLOAD_INTENT_PORT = Symbol('UPLOAD_INTENT_PORT');
