export enum UserStatus {
  PendingVerification = 'PENDING_VERIFICATION',
  Active = 'ACTIVE',
  Locked = 'LOCKED',
  Suspended = 'SUSPENDED',
  Deleted = 'DELETED',
}

export enum DevicePlatform {
  Android = 'ANDROID',
  Ios = 'IOS',
  Website = 'WEBSITE',
}

export enum ActionTokenPurpose {
  VerifyEmail = 'VERIFY_EMAIL',
  ResetPassword = 'RESET_PASSWORD',
}

export enum PushRegistrationType {
  FcmToken = 'FCM_TOKEN',
  Fid = 'FID',
}

export enum PushRegistrationStatus {
  Active = 'ACTIVE',
  Inactive = 'INACTIVE',
  Invalid = 'INVALID',
}

export enum AuthEventResult {
  Success = 'SUCCESS',
  Failure = 'FAILURE',
}
