import { PushRegistrationStatus, PushRegistrationType } from './enums/auth.enums.js';
import { assertNonEmpty, assertUuid, type Uuid } from './auth.types.js';

export interface PushRegistrationProps {
  id: Uuid;
  deviceId: Uuid;
  registrationType: PushRegistrationType;
  registrationValue: string;
  notificationEnabled: boolean;
  status: PushRegistrationStatus;
  lastRegisteredAt: Date;
  lastSuccessAt: Date | null;
  lastFailureAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export class PushRegistration {
  readonly provider = 'FCM';

  constructor(readonly props: PushRegistrationProps) {
    assertUuid(props.id, 'Push registration id');
    assertUuid(props.deviceId, 'Device id');
    assertNonEmpty(props.registrationValue, 'Registration value');
  }
}
