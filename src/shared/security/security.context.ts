import { createParamDecorator, type ExecutionContext } from '@nestjs/common';
import type { Request } from 'express';
import type { Uuid } from '../types/domain.types.js';

export interface SecurityContext {
  userId: Uuid;
  email: string;
  tokenVersion: number;
  roles: string[];
}

type AuthenticatedRequest = Request & { user?: SecurityContext };

export const CurrentUser = createParamDecorator(
  (_data: unknown, context: ExecutionContext): SecurityContext | undefined =>
    context.switchToHttp().getRequest<AuthenticatedRequest>().user,
);
