import type { Uuid } from '../../../../shared/types/domain.types.js';

export interface UploadIntent {
  id: Uuid;
  userId: Uuid;
  publicId: string;
  expiresAt: Date;
  consumedAt: Date | null;
  revokedAt: Date | null;
  createdAt: Date;
}
