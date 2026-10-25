import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { createHash, randomBytes } from 'node:crypto';
import type { AuthUserRecord } from '../ports/index.js';

export interface TokenPayload {
  sub: string;
  email: string;
  tokenVersion: number;
  roles: string[];
}

@Injectable()
export class TokenService {
  readonly accessTokenTtlSeconds: number;
  readonly refreshTokenTtlDays: number;

  constructor(
    private readonly jwt: JwtService,
    config: ConfigService,
  ) {
    this.accessTokenTtlSeconds = Number(
      config.get<string>('GLOWNSCAN_ACCESS_TOKEN_TTL_SECONDS', '900'),
    );
    this.refreshTokenTtlDays = Number(
      config.get<string>('GLOWNSCAN_REFRESH_TOKEN_TTL_DAYS', '30'),
    );
    if (
      !Number.isInteger(this.accessTokenTtlSeconds) ||
      this.accessTokenTtlSeconds < 60 ||
      !Number.isInteger(this.refreshTokenTtlDays) ||
      this.refreshTokenTtlDays < 1
    ) {
      throw new Error('JWT and refresh token expiration settings are invalid.');
    }
  }

  issueAccessToken(user: AuthUserRecord): Promise<string> {
    return this.jwt.signAsync({
      sub: user.id,
      email: user.email,
      tokenVersion: user.tokenVersion,
      roles: user.roles,
    } satisfies TokenPayload);
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
