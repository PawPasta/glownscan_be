import type { Email } from '../../domain/value-objects/email.vo.js';
import type { User } from '../../domain/entities/user.entity.js';
import type { Uuid } from '../../domain/entities/auth.types.js';
import type { RepositoryPort } from '../../../../shared/ports/repository.port.js';

export interface UserRepositoryPort extends RepositoryPort<User, Uuid> {
  findByEmail(email: Email): Promise<User | null>;
  existsByEmail(email: Email): Promise<boolean>;
}
