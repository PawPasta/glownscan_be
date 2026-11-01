import type { Uuid } from '../../../../shared/types/domain.types.js';

export type CloudinaryUploadPurpose = 'AVATAR' | 'SKIN_ANALYSIS';

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
