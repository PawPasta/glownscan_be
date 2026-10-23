import type { Permission } from '../../domain/entities/permission.entity.js';
import type { RepositoryPort } from '../../../../shared/ports/repository.port.js';

export interface PermissionRepositoryPort extends RepositoryPort<
  Permission,
  number
> {
  findByCode(code: string): Promise<Permission | null>;
  existsByCode(code: string): Promise<boolean>;
}
