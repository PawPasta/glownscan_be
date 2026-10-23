import {
  assertUuid,
  type IpAddress,
  type Uuid,
} from '../../../../shared/types/domain.types.js';

export interface RefreshTokenProps {
  id: Uuid;
  userId: Uuid;
  deviceId: Uuid;
  tokenHash: string;
  tokenFamilyId: Uuid;
  replacedByTokenId: Uuid | null;
  expiresAt: Date;
  revokedAt: Date | null;
  revokeReason: string | null;
  ipAddress: IpAddress | null;
  userAgent: string | null;
  createdAt: Date;
}

export class RefreshToken {
  constructor(readonly props: RefreshTokenProps) {
    assertUuid(props.id, 'Refresh token id');
    assertUuid(props.userId, 'User id');
    assertUuid(props.deviceId, 'Device id');
    assertUuid(props.tokenFamilyId, 'Token family id');
    if (!/^[0-9a-f]{64}$/.test(props.tokenHash)) {
      throw new Error(
        'Refresh token hash must be a 64-character lowercase SHA-256 hash.',
      );
    }
    if (props.expiresAt <= props.createdAt) {
      throw new Error('Refresh token must expire after it is created.');
    }
    if (props.revokedAt === null && props.revokeReason !== null) {
      throw new Error('A revoke reason requires the token to be revoked.');
    }
    if (props.replacedByTokenId !== null) {
      assertUuid(props.replacedByTokenId, 'Replacement token id');
      if (props.replacedByTokenId === props.id || props.revokedAt === null) {
        throw new Error(
          'A replaced token must be revoked and cannot replace itself.',
        );
      }
    }
  }

  get isRevoked(): boolean {
    return this.props.revokedAt !== null;
  }
}
