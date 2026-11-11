import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import { TooManyRequestsException } from '../handler/http.exceptions.js';
import type { SecurityContext } from '../security/security.context.js';
import {
  RATE_LIMIT_OPTIONS,
  type RateLimitOptions,
} from './rate-limit.decorator.js';
import { RateLimitService } from './rate-limit.service.js';

type RateLimitedRequest = Request & { user?: SecurityContext };

@Injectable()
export class RateLimitGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly rateLimit: RateLimitService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const options = this.reflector.getAllAndOverride<RateLimitOptions>(
      RATE_LIMIT_OPTIONS,
      [context.getHandler(), context.getClass()],
    );
    if (!options) return true;

    const request = context.switchToHttp().getRequest<RateLimitedRequest>();
    const subject =
      options.key === 'USER'
        ? request.user?.userId
        : request.ip || request.socket.remoteAddress;
    if (!subject) return true;
    const result = await this.rateLimit.consume(
      options.scope,
      subject,
      options.limit,
      options.windowSeconds,
    );
    if (!result.allowed) {
      throw new TooManyRequestsException(
        'Too many requests. Please try again later.',
        result.retryAfterSeconds,
      );
    }
    return true;
  }
}
