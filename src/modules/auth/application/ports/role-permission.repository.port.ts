import type { RolePermission } from '../../domain/entities/role-permission.entity.js';
import type { Uuid } from '../../domain/entities/auth.types.js';
import type { RepositoryPort } from '../../../../shared/ports/repository.port.js';

export interface RolePermissionRepositoryPort extends RepositoryPort<
  RolePermission,
  Uuid
> {
  findByRoleId(roleId: number): Promise<RolePermission[]>;
  existsByRoleIdAndPermissionId(
    roleId: number,
    permissionId: number,
  ): Promise<boolean>;
}
