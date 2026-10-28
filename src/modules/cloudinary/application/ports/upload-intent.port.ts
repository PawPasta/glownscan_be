import type { Uuid } from '../../../../shared/types/domain.types.js';

export interface UploadIntentPort {
  createAvatarIntent(
    userId: Uuid,
    publicId: string,
    expiresAt: Date,
  ): Promise<void>;
  consumeAvatarIntent(
    userId: Uuid,
    publicId: string,
    secureUrl: string,
  ): Promise<boolean>;
}

export const UPLOAD_INTENT_PORT = Symbol('UPLOAD_INTENT_PORT');
