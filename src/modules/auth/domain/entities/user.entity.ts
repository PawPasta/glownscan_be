import { Email } from '../value-objects/email.vo.js';
import { UserStatus } from './enums/auth.enums.js';
import {
  assertUuid,
  type Uuid,
} from '../../../../shared/types/domain.types.js';

export interface UserProps {
  id: Uuid;
  email: Email;
  passwordHash: string;
  status: UserStatus;
  emailVerifiedAt: Date | null;
  tokenVersion: number;
  failedLoginCount: number;
  lockedUntil: Date | null;
  lastLoginAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  deletedAt: Date | null;
}

export class User {
  constructor(readonly props: UserProps) {
    assertUuid(props.id, 'User id');
    if (!props.passwordHash) {
      throw new Error('User password hash cannot be empty.');
    }
    if (!Number.isInteger(props.tokenVersion) || props.tokenVersion < 1) {
      throw new RangeError('User token version must be at least 1.');
    }
    if (
      !Number.isInteger(props.failedLoginCount) ||
      props.failedLoginCount < 0
    ) {
      throw new RangeError('User failed login count cannot be negative.');
    }
    if ((props.status === UserStatus.Deleted) !== (props.deletedAt !== null)) {
      throw new Error('Deleted users must have deletedAt set, and vice versa.');
    }
  }

  get id(): Uuid {
    return this.props.id;
  }

  get email(): Email {
    return this.props.email;
  }

  get status(): UserStatus {
    return this.props.status;
  }
}
