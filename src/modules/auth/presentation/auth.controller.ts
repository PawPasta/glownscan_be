import {
  Body,
  Controller,
  Get,
  Patch,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth } from '@nestjs/swagger';
import type { Request } from 'express';
import {
  CurrentUser,
  type SecurityContext,
} from '../../../shared/security/security.context.js';
import { AuthenticationService } from '../application/use-case/authentication.service.js';
import {
  ChangePasswordDto,
  CheckActionTokenDto,
  ConfirmAvatarUploadDto,
  FirebaseLoginDto,
  FirebaseMobileLoginDto,
  LoginDto,
  MobileLoginDto,
  LogoutTokenDto,
  RefreshTokenDto,
  ResendVerificationDto,
  RegisterDto,
  ResetPasswordDto,
  ResetPasswordRequestDto,
  UpdateUserProfileDto,
  VerifyEmailDto,
} from './auth.dto.js';
import { JwtAuthGuard } from '../../../shared/security/jwt-auth.guard.js';
import { CloudinaryUploadIntentService } from '../../cloudinary/application/use-case/cloudinary-upload-intent.service.js';

@Controller('auth')
export class AuthController {
  constructor(
    private readonly authentication: AuthenticationService,
    private readonly cloudinary: CloudinaryUploadIntentService,
  ) {}

  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('access-token')
  @Get('profile')
  getProfile(@CurrentUser() user: SecurityContext) {
    return this.authentication.getProfile(user.userId);
  }

  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('access-token')
  @Patch('profile')
  updateProfile(
    @CurrentUser() user: SecurityContext,
    @Body() body: UpdateUserProfileDto,
  ) {
    return this.authentication.updateProfile(user.userId, body);
  }

  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('access-token')
  @Post('profile/avatar/upload-intent')
  createAvatarUploadIntent(@CurrentUser() user: SecurityContext) {
    return this.cloudinary.createAvatarUploadIntent(user.userId);
  }

  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('access-token')
  @Post('profile/avatar/confirm')
  async confirmAvatarUpload(
    @CurrentUser() user: SecurityContext,
    @Body() body: ConfirmAvatarUploadDto,
  ) {
    await this.cloudinary.confirmAvatarUpload(user.userId, body);
    return this.authentication.getProfile(user.userId);
  }

  @Post('register')
  register(@Body() body: RegisterDto) {
    return this.authentication.register(body);
  }

  @Post('verify-email')
  verifyEmail(@Body() body: VerifyEmailDto) {
    return this.authentication.verifyEmail(body);
  }

  @Post('verify-email/check')
  checkEmailVerification(@Body() body: CheckActionTokenDto) {
    return this.authentication.checkEmailVerification(body);
  }

  @Post('verify-email/resend')
  resendVerification(
    @Body() body: ResendVerificationDto,
  ) {
    return this.authentication.resendVerification(body.email);
  }

  @Post('login')
  login(
    @Body() body: LoginDto,
    @Req() request: Request,
  ) {
    return this.authentication.login(body, {
      ipAddress: request.ip ?? null,
      userAgent: request.get('user-agent') ?? null,
    });
  }

  @Post('mobile/login')
  loginMobile(
    @Body() body: MobileLoginDto,
    @Req() request: Request,
  ) {
    return this.authentication.loginMobile(body, {
      ipAddress: request.ip ?? null,
      userAgent: request.get('user-agent') ?? null,
    });
  }

  @Post('firebase/login')
  loginWithFirebase(
    @Body() body: FirebaseLoginDto,
    @Req() request: Request,
  ) {
    return this.authentication.loginWithFirebase(body, {
      ipAddress: request.ip ?? null,
      userAgent: request.get('user-agent') ?? null,
    });
  }

  @Post('firebase/mobile/login')
  loginMobileWithFirebase(
    @Body() body: FirebaseMobileLoginDto,
    @Req() request: Request,
  ) {
    return this.authentication.loginWithFirebaseMobile(body, {
      ipAddress: request.ip ?? null,
      userAgent: request.get('user-agent') ?? null,
    });
  }

  @Post('refresh')
  refresh(@Body() body: RefreshTokenDto) {
    return this.authentication.refresh(body);
  }

  @Post('logout')
  logout(@Body() body: LogoutTokenDto) {
    return this.authentication.logout(body.refreshToken);
  }

  @Post('password/reset/request')
  requestPasswordReset(
    @Body() body: ResetPasswordRequestDto,
  ) {
    return this.authentication.requestPasswordReset(body.email);
  }

  @Post('password/reset/resend')
  resendPasswordReset(
    @Body() body: ResetPasswordRequestDto,
  ) {
    return this.authentication.requestPasswordReset(body.email);
  }

  @Post('password/reset/check')
  checkPasswordReset(@Body() body: CheckActionTokenDto) {
    return this.authentication.checkPasswordReset(body);
  }

  @Post('password/reset/confirm')
  resetPassword(@Body() body: ResetPasswordDto) {
    return this.authentication.resetPassword(body);
  }

  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('access-token')
  @Post('password/change')
  changePassword(
    @CurrentUser() user: SecurityContext,
    @Body() body: ChangePasswordDto,
  ) {
    return this.authentication.changePassword(user, body);
  }
}
