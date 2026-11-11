import { SetMetadata } from '@nestjs/common';

export interface RateLimitOptions {
  scope: string;
  limit: number;
  windowSeconds: number;
  key: 'IP' | 'USER';
}

export const RATE_LIMIT_OPTIONS = Symbol('RATE_LIMIT_OPTIONS');

export const RateLimit = (options: RateLimitOptions) =>
  SetMetadata(RATE_LIMIT_OPTIONS, options);
