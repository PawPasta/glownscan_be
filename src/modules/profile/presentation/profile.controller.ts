import { Body, Controller, Get, Patch, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import {
  CurrentUser,
  type SecurityContext,
} from '../../../shared/security/security.context.js';
import { JwtAuthGuard } from '../../../shared/security/jwt-auth.guard.js';
import { CloudinaryUploadIntentService } from '../../cloudinary/application/use-case/cloudinary-upload-intent.service.js';
import { ProfileService } from '../application/use-case/profile.service.js';
import {
  ConfirmAvatarUploadDto,
  UpdateSkinProfileDto,
  UpdateUserProfileDto,
} from './profile.dto.js';

@ApiTags('profile')
@ApiBearerAuth('access-token')
@UseGuards(JwtAuthGuard)
@Controller('profile')
export class ProfileController {
  constructor(
    private readonly profile: ProfileService,
    private readonly cloudinary: CloudinaryUploadIntentService,
  ) {}

  @Get()
  getProfile(@CurrentUser() user: SecurityContext) {
    return this.profile.getProfile(user.userId);
  }

  @Patch()
  updateUserProfile(
    @CurrentUser() user: SecurityContext,
    @Body() body: UpdateUserProfileDto,
  ) {
    return this.profile.updateUserProfile(user.userId, body);
  }

  @Patch('skin')
  updateSkinProfile(
    @CurrentUser() user: SecurityContext,
    @Body() body: UpdateSkinProfileDto,
  ) {
    return this.profile.updateSkinProfile(user.userId, body);
  }

  @Post('avatar/upload-intent')
  createAvatarUploadIntent(@CurrentUser() user: SecurityContext) {
    return this.cloudinary.createAvatarUploadIntent(user.userId);
  }

  @Post('avatar/confirm')
  async confirmAvatarUpload(
    @CurrentUser() user: SecurityContext,
    @Body() body: ConfirmAvatarUploadDto,
  ) {
    await this.cloudinary.confirmAvatarUpload(user.userId, body);
    return this.profile.getProfile(user.userId);
  }
}
