import type { RefreshToken } from '../../domain/entities/refresh-token.entity.js';
import type { Uuid } from '../../domain/entities/auth.types.js';
import type { RepositoryPort } from '../../../../shared/ports/repository.port.js';

export interface RefreshTokenRepositoryPort extends RepositoryPort<
  RefreshToken,
  Uuid
> {
  findByTokenHash(tokenHash: string): Promise<RefreshToken | null>;
  findCurrentByTokenFamilyId(tokenFamilyId: Uuid): Promise<RefreshToken | null>;
  findActiveByUserId(userId: Uuid, at: Date): Promise<RefreshToken[]>;
}
