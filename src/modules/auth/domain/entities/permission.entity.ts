import { assertNonEmpty, assertSmallInt } from './auth.types.js';

export interface PermissionProps {
  id: number;
  code: string;
  name: string;
  description: string | null;
  createdAt: Date;
}

export class Permission {
  constructor(readonly props: PermissionProps) {
    assertSmallInt(props.id, 'Permission id');
    assertNonEmpty(props.code, 'Permission code');
    if (props.code !== props.code.toUpperCase()) {
      throw new Error('Permission code must be uppercase.');
    }
    assertNonEmpty(props.name, 'Permission name');
  }

  get id(): number {
    return this.props.id;
  }
}
