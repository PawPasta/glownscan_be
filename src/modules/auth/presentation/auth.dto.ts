import {
  IsEmail,
  IsIn,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';

export class RegisterDto {
  @IsEmail()
  @MaxLength(320)
  email!: string;

  @IsString()
  @MinLength(6)
  @MaxLength(72)
  password!: string;

  @IsString()
  confirmPassword!: string;
}

export class VerifyEmailDto {
  @IsEmail()
  email!: string;

  @IsString()
  @MinLength(32)
  token!: string;
}

export class CheckActionTokenDto {
  @IsEmail()
  email!: string;

  @IsString()
  @MinLength(32)
  @MaxLength(128)
  token!: string;
}

export class ResendVerificationDto {
  @IsEmail()
  email!: string;
}

export class LoginDto {
  @IsEmail()
  email!: string;

  @IsString()
  password!: string;

  @IsOptional()
  @IsIn(['ANDROID', 'IOS', 'WEBSITE'])
  platform?: 'ANDROID' | 'IOS' | 'WEBSITE';
}

export class MobileLoginDto {
  @IsEmail()
  email!: string;

  @IsString()
  password!: string;

  @IsIn(['ANDROID', 'IOS'])
  platform!: 'ANDROID' | 'IOS';

  @IsString()
  @MinLength(1)
  @MaxLength(4096)
  fcmToken!: string;
}

export class FirebaseLoginDto {
  @IsString()
  @MinLength(1)
  @MaxLength(8192)
  idToken!: string;

  @IsOptional()
  @IsIn(['ANDROID', 'IOS', 'WEBSITE'])
  platform?: 'ANDROID' | 'IOS' | 'WEBSITE';
}

export class FirebaseMobileLoginDto {
  @IsString()
  @MinLength(1)
  @MaxLength(8192)
  idToken!: string;

  @IsIn(['ANDROID', 'IOS'])
  platform!: 'ANDROID' | 'IOS';

  @IsString()
  @MinLength(1)
  @MaxLength(4096)
  fcmToken!: string;
}

export class RefreshTokenDto {
  @IsString()
  @MinLength(1)
  @MaxLength(4096)
  accessToken!: string;

  @IsString()
  @MinLength(32)
  @MaxLength(128)
  refreshToken!: string;
}

export class LogoutTokenDto {
  @IsString()
  @MinLength(32)
  @MaxLength(128)
  refreshToken!: string;
}

export class ResetPasswordRequestDto {
  @IsEmail()
  email!: string;
}

export class ResetPasswordDto {
  @IsEmail()
  email!: string;

  @IsString()
  @MinLength(32)
  @MaxLength(128)
  token!: string;

  @IsString()
  @MinLength(6)
  @MaxLength(72)
  newPassword!: string;
}

export class ChangePasswordDto {
  @IsString()
  oldPassword!: string;

  @IsString()
  @MinLength(6)
  @MaxLength(72)
  newPassword!: string;
}
