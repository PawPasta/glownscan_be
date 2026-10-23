import type { Role } from '../../domain/entities/role.entity.js';
import type { RepositoryPort } from '../../../../shared/ports/repository.port.js';

export interface RoleRepositoryPort extends RepositoryPort<Role, number> {
  findByCode(code: string): Promise<Role | null>;
  existsByCode(code: string): Promise<boolean>;
}
