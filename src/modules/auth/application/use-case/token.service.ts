import { Injectable } from '@nestjs/common';
import { Inject } from '@nestjs/common';
import { createHash, randomBytes } from 'node:crypto';
import type { AuthUserRecord } from '../ports/index.js';
import {
  TOKEN_RUNTIME_PORT,
  type TokenPayload,
  type TokenRuntimePort,
} from '../ports/token-runtime.port.js';

@Injectable()
export class TokenService {
  constructor(
    @Inject(TOKEN_RUNTIME_PORT)
    private readonly tokenRuntime: TokenRuntimePort,
  ) {}

  get accessTokenTtlSeconds() {
    return this.tokenRuntime.accessTokenTtlSeconds;
  }

  get refreshTokenTtlDays() {
    return this.tokenRuntime.refreshTokenTtlDays;
  }

  get refreshSessionAbsoluteTtlDays() {
    return this.tokenRuntime.refreshSessionAbsoluteTtlDays;
  }

  issueAccessToken(user: AuthUserRecord): Promise<string> {
    return this.tokenRuntime.issueAccessToken({
      sub: user.id,
      email: user.email,
      tokenVersion: user.tokenVersion,
      roles: user.roles,
    } satisfies TokenPayload);
  }

  verifyAccessToken(token: string): Promise<TokenPayload> {
    return this.tokenRuntime.verifyAccessToken(token);
  }

  verifyAccessTokenForRefresh(token: string): Promise<TokenPayload> {
    return this.tokenRuntime.verifyAccessTokenForRefresh(token);
  }

  createOpaqueToken(): string {
    return randomBytes(32).toString('base64url');
  }

  hashToken(token: string): string {
    return createHash('sha256').update(token).digest('hex');
  }

  expiryInHours(hours: number): Date {
    return new Date(Date.now() + hours * 60 * 60 * 1000);
  }

  expiryInDays(days: number): Date {
    return new Date(Date.now() + days * 24 * 60 * 60 * 1000);
  }
}
