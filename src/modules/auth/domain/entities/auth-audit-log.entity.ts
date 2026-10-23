import { AuthEventResult } from './enums/auth.enums.js';
import {
  assertNonEmpty,
  assertUuid,
  type IpAddress,
  type JsonObject,
  type Uuid,
} from './auth.types.js';

export interface AuthAuditLogProps {
  id: number;
  userId: Uuid | null;
  eventType: string;
  result: AuthEventResult;
  ipAddress: IpAddress | null;
  userAgent: string | null;
  deviceId: Uuid | null;
  metadata: JsonObject;
  occurredAt: Date;
}

export class AuthAuditLog {
  constructor(readonly props: AuthAuditLogProps) {
    if (!Number.isSafeInteger(props.id) || props.id < 1) {
      throw new RangeError(
        'Auth audit log id must be a positive safe integer.',
      );
    }
    if (props.userId !== null) {
      assertUuid(props.userId, 'User id');
    }
    if (props.deviceId !== null) {
      assertUuid(props.deviceId, 'Device id');
    }
    assertNonEmpty(props.eventType, 'Auth event type');
    if (
      props.metadata === null ||
      Array.isArray(props.metadata) ||
      typeof props.metadata !== 'object'
    ) {
      throw new Error('Auth audit metadata must be a JSON object.');
    }
  }
}
