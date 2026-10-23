import { ActionTokenPurpose } from './enums/auth.enums.js';
import {
  assertUuid,
  type Uuid,
} from '../../../../shared/types/domain.types.js';

export interface ActionTokenProps {
  id: Uuid;
  userId: Uuid;
  purpose: ActionTokenPurpose;
  tokenHash: string;
  expiresAt: Date;
  consumedAt: Date | null;
  revokedAt: Date | null;
  createdAt: Date;
}

export class ActionToken {
  constructor(readonly props: ActionTokenProps) {
    assertUuid(props.id, 'Action token id');
    assertUuid(props.userId, 'User id');
    if (!/^[0-9a-f]{64}$/.test(props.tokenHash)) {
      throw new Error(
        'Action token hash must be a 64-character lowercase SHA-256 hash.',
      );
    }
    if (props.expiresAt <= props.createdAt) {
      throw new Error('Action token must expire after it is created.');
    }
    if (props.consumedAt !== null && props.revokedAt !== null) {
      throw new Error(
        'An action token cannot be consumed and revoked at the same time.',
      );
    }
  }

  get isPending(): boolean {
    return this.props.consumedAt === null && this.props.revokedAt === null;
  }
}
