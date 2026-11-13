import {
  CanActivate,
  ExecutionContext,
  HttpStatus,
  Inject,
  Injectable,
  SetMetadata,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ApiException } from '../handler/http.exceptions.js';
import type { SecurityContext } from './security.context.js';
import {
  ACCESS_PERMISSION_PORT,
  type AccessPermissionPort,
} from './access-permission.port.js';

export type AccessPermissionCode =
  | 'SKIN_ANALYSIS_BASIC'
  | 'SKIN_ANALYSIS_DETAILS'
  | 'RECOMMENDATION_READ'
  | 'ROUTINE_MANAGE';

const ACCESS_PERMISSION_METADATA = 'accessPermission';

export const RequirePermission = (permission: AccessPermissionCode) =>
  SetMetadata(ACCESS_PERMISSION_METADATA, permission);

@Injectable()
export class AccessPermissionGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    @Inject(ACCESS_PERMISSION_PORT)
    private readonly permissions: AccessPermissionPort,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context
      .switchToHttp()
      .getRequest<{ user?: SecurityContext }>();
    const user = request.user;

    if (!user) {
      throw new ApiException(
        HttpStatus.UNAUTHORIZED,
        'Authentication is required.',
        'UNAUTHORIZED',
      );
    }
    if (user.roles.includes('ADMIN')) return true;
    const permission = this.reflector.getAllAndOverride<AccessPermissionCode>(
      ACCESS_PERMISSION_METADATA,
      [context.getHandler(), context.getClass()],
    );
    if (
      permission &&
      (await this.permissions.hasPermission(user.userId, permission))
    )
      return true;

    throw new ApiException(
      HttpStatus.FORBIDDEN,
      permission === 'SKIN_ANALYSIS_BASIC'
        ? 'This account does not have permission to run skin analysis.'
        : 'This feature requires an active Premium subscription.',
      permission === 'SKIN_ANALYSIS_BASIC'
        ? 'PERMISSION_REQUIRED'
        : 'PREMIUM_REQUIRED',
    );
  }
}
