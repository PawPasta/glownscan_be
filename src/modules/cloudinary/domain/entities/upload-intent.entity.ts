import type { Uuid } from '../../../../shared/types/domain.types.js';

export type CloudinaryUploadPurpose = 'AVATAR' | 'SKIN_ANALYSIS';

export interface UploadIntent {
  id: Uuid;
  userId: Uuid;
  purpose: CloudinaryUploadPurpose;
  publicId: string;
  expiresAt: Date;
  consumedAt: Date | null;
  revokedAt: Date | null;
  createdAt: Date;
}
