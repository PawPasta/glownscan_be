import { DevicePlatform } from './enums/auth.enums.js';
import {
  assertNonEmpty,
  assertUuid,
  type Uuid,
} from '../../../../shared/types/domain.types.js';

export interface UserDeviceProps {
  id: Uuid;
  userId: Uuid;
  deviceUuid: string;
  platform: DevicePlatform;
  deviceName: string | null;
  deviceModel: string | null;
  osVersion: string | null;
  appVersion: string | null;
  trusted: boolean;
  lastActiveAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export class UserDevice {
  constructor(readonly props: UserDeviceProps) {
    assertUuid(props.id, 'Device id');
    assertUuid(props.userId, 'User id');
    assertNonEmpty(props.deviceUuid, 'Device UUID');
  }
}
