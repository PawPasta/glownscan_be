import type { Uuid } from '../../../../shared/types/domain.types.js';
import type {
  Gender,
  UserProfile,
} from '../../domain/entities/user-profile.entity.js';
import type {
  SensitivityLevel,
  SkinProfile,
  SkinType,
} from '../../domain/entities/skin-profile.entity.js';

export interface ProfileSnapshot {
  profile: UserProfile;
  skinProfile: SkinProfile | null;
}

export interface UserProfileUpdate {
  fullName?: string | null;
  dateOfBirth?: string | null;
  gender?: Gender | null;
}

export interface SkinProfileUpdate {
  skinType?: SkinType | null;
  sensitivityLevel?: SensitivityLevel | null;
  notes?: string | null;
}

export interface ProfilePort {
  getProfile(userId: Uuid): Promise<ProfileSnapshot>;
  updateUserProfile(userId: Uuid, changes: UserProfileUpdate): Promise<void>;
  updateSkinProfile(userId: Uuid, changes: SkinProfileUpdate): Promise<void>;
}

export const PROFILE_PORT = Symbol('PROFILE_PORT');
