import type { Uuid } from '../../../../shared/types/domain.types.js';

export type Gender = 'MALE' | 'FEMALE' | 'OTHER' | 'PREFER_NOT_TO_SAY';

export interface UserProfile {
  id: Uuid;
  userId: Uuid;
  fullName: string | null;
  avatarUrl: string | null;
  dateOfBirth: string | null;
  gender: Gender | null;
  createdAt: Date;
  updatedAt: Date;
}
