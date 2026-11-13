import {
  assertUuid,
  type Uuid,
} from '../../../../shared/types/domain.types.js';

export interface AuthSessionProps {
  tokenFamilyId: Uuid;
  userId: Uuid;
  deviceId: Uuid;
  createdAt: Date;
  lastRefreshedAt: Date;
  idleExpiresAt: Date;
  absoluteExpiresAt: Date;
  revokedAt: Date | null;
  revokeReason: string | null;
}

export class AuthSession {
  constructor(readonly props: AuthSessionProps) {
    assertUuid(props.tokenFamilyId, 'Token family id');
    assertUuid(props.userId, 'User id');
    assertUuid(props.deviceId, 'Device id');
    if (props.idleExpiresAt <= props.createdAt) {
      throw new Error('Auth session idle expiry must follow creation.');
    }
    if (props.absoluteExpiresAt < props.idleExpiresAt) {
      throw new Error(
        'Auth session absolute expiry cannot precede idle expiry.',
      );
    }
    if (props.revokedAt === null && props.revokeReason !== null) {
      throw new Error('A revoke reason requires the session to be revoked.');
    }
  }

  isActiveAt(now: Date): boolean {
    return (
      this.props.revokedAt === null &&
      this.props.idleExpiresAt > now &&
      this.props.absoluteExpiresAt > now
    );
  }
}
