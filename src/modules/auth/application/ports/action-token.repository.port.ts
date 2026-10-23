import type { ActionTokenPurpose } from '../../domain/entities/enums/auth.enums.js';
import type { ActionToken } from '../../domain/entities/action-token.entity.js';
import type { Uuid } from '../../domain/entities/auth.types.js';
import type { RepositoryPort } from '../../../../shared/ports/repository.port.js';

export interface ActionTokenRepositoryPort extends RepositoryPort<
  ActionToken,
  Uuid
> {
  findByTokenHash(tokenHash: string): Promise<ActionToken | null>;
  findPendingByUserIdAndPurpose(
    userId: Uuid,
    purpose: ActionTokenPurpose,
  ): Promise<ActionToken | null>;
}
