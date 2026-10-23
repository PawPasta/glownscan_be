import { assertSmallInt, assertUuid, type Uuid } from './auth.types.js';

export interface RolePermissionProps {
  id: Uuid;
  roleId: number;
  permissionId: number;
  grantedAt: Date;
}

export class RolePermission {
  constructor(readonly props: RolePermissionProps) {
    assertUuid(props.id, 'Role permission id');
    assertSmallInt(props.roleId, 'Role id');
    assertSmallInt(props.permissionId, 'Permission id');
  }
}
