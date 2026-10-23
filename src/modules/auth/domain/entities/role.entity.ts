import {
  assertNonEmpty,
  assertSmallInt,
} from '../../../../shared/types/domain.types.js';

export interface RoleProps {
  id: number;
  code: string;
  name: string;
  description: string | null;
  createdAt: Date;
}

export class Role {
  constructor(readonly props: RoleProps) {
    assertSmallInt(props.id, 'Role id');
    assertNonEmpty(props.code, 'Role code');
    if (props.code !== props.code.toUpperCase()) {
      throw new Error('Role code must be uppercase.');
    }
    assertNonEmpty(props.name, 'Role name');
  }

  get id(): number {
    return this.props.id;
  }
}
