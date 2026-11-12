import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { ForbiddenException } from '../handler/http.exceptions.js';
import type { SecurityContext } from './security.context.js';

@Injectable()
export class AdminGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context
      .switchToHttp()
      .getRequest<{ user?: SecurityContext }>();
    if (!request.user?.roles.includes('ADMIN')) {
      throw new ForbiddenException('Administrator role is required.');
    }
    return true;
  }
}
