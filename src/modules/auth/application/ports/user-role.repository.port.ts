import type { UserRole } from '../../domain/entities/user-role.entity.js';
import type { Uuid } from '../../domain/entities/auth.types.js';
import type { RepositoryPort } from '../../../../shared/ports/repository.port.js';

export interface UserRoleRepositoryPort extends RepositoryPort<UserRole, Uuid> {
  findByUserId(userId: Uuid): Promise<UserRole[]>;
  existsByUserIdAndRoleId(userId: Uuid, roleId: number): Promise<boolean>;
  deleteByUserIdAndRoleId(userId: Uuid, roleId: number): Promise<boolean>;
}
