import type { UserDevice } from '../../domain/entities/user-device.entity.js';
import type { Uuid } from '../../domain/entities/auth.types.js';
import type { Page, PageRequest, RepositoryPort } from '../../../../shared/ports/repository.port.js';

export interface UserDeviceRepositoryPort extends RepositoryPort<
  UserDevice,
  Uuid
> {
  findByUserId(userId: Uuid, page: PageRequest): Promise<Page<UserDevice>>;
  findByUserIdAndDeviceUuid(
    userId: Uuid,
    deviceUuid: string,
  ): Promise<UserDevice | null>;
}
