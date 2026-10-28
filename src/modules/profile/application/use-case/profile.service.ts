import { Inject, Injectable } from '@nestjs/common';
import type { Uuid } from '../../../../shared/types/domain.types.js';
import {
  PROFILE_PORT,
  type ProfilePort,
  type ProfileSnapshot,
  type SkinProfileUpdate,
  type UserProfileUpdate,
} from '../ports/profile.port.js';

@Injectable()
export class ProfileService {
  constructor(
    @Inject(PROFILE_PORT) private readonly profilePort: ProfilePort,
  ) {}

  getProfile(userId: Uuid): Promise<ProfileSnapshot> {
    return this.profilePort.getProfile(userId);
  }

  async updateUserProfile(
    userId: Uuid,
    changes: UserProfileUpdate,
  ): Promise<ProfileSnapshot> {
    await this.profilePort.updateUserProfile(userId, changes);
    return this.getProfile(userId);
  }

  async updateSkinProfile(
    userId: Uuid,
    changes: SkinProfileUpdate,
  ): Promise<ProfileSnapshot> {
    await this.profilePort.updateSkinProfile(userId, changes);
    return this.getProfile(userId);
  }
}
