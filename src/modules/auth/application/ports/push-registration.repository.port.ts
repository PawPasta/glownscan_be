import type { PushRegistration } from '../../domain/entities/push-registration.entity.js';
import type { Uuid } from '../../domain/entities/auth.types.js';
import type { RepositoryPort } from '../../../../shared/ports/repository.port.js';

export interface PushRegistrationRepositoryPort extends RepositoryPort<
  PushRegistration,
  Uuid
> {
  findByRegistrationValue(
    registrationValue: string,
  ): Promise<PushRegistration | null>;
  findActiveByDeviceId(deviceId: Uuid): Promise<PushRegistration | null>;
  findByDeviceId(deviceId: Uuid): Promise<PushRegistration[]>;
}
