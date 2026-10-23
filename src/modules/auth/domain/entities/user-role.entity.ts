import {
  assertSmallInt,
  assertUuid,
  type Uuid,
} from '../../../../shared/types/domain.types.js';

export interface UserRoleProps {
  id: Uuid;
  userId: Uuid;
  roleId: number;
  assignedAt: Date;
  assignedBy: Uuid | null;
}

export class UserRole {
  constructor(readonly props: UserRoleProps) {
    assertUuid(props.id, 'User role id');
    assertUuid(props.userId, 'User id');
    assertSmallInt(props.roleId, 'Role id');
    if (props.assignedBy !== null) {
      assertUuid(props.assignedBy, 'Assigned by');
    }
  }
}
