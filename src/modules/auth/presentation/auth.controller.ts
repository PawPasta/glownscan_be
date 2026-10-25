import { Body, Controller, Post, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth } from '@nestjs/swagger';
import type { Request } from 'express';
import {
  CurrentUser,
  type SecurityContext,
} from '../../../shared/security/security.context.js';
import { AuthenticationService } from '../application/use-case/authentication.service.js';
import {
  ChangePasswordDto,
  LoginDto,
  LogoutTokenDto,
  RefreshTokenDto,
  ResendVerificationDto,
  RegisterDto,
  ResetPasswordDto,
  ResetPasswordRequestDto,
  VerifyEmailDto,
} from './auth.dto.js';
import { JwtAuthGuard } from './jwt-auth.guard.js';

@Controller('auth')
export class AuthController {
  constructor(private readonly authentication: AuthenticationService) {}

  @Post('register')
  register(@Body() body: RegisterDto) {
    return this.authentication.register(body);
  }

  @Post('verify-email')
  verifyEmail(@Body() body: VerifyEmailDto) {
    return this.authentication.verifyEmail(body);
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
