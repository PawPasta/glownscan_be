import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import type {
  TokenPayload,
  TokenRuntimePort,
} from '../../application/ports/token-runtime.port.js';

@Injectable()
export class JwtTokenRuntimeAdapter implements TokenRuntimePort {
  readonly accessTokenTtlSeconds: number;
  readonly refreshTokenTtlDays: number;
  private readonly issuer: string;
  private readonly audience: string;

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
    this.issuer = config.get<string>('GLOWNSCAN_JWT_ISSUER', 'glownscan-api');
    this.audience = config.get<string>(
      'GLOWNSCAN_JWT_AUDIENCE',
      'glownscan-client',
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

  issueAccessToken(payload: TokenPayload) {
    return this.jwt.signAsync(payload, {
      issuer: this.issuer,
      audience: this.audience,
    });
  }

  verifyAccessToken(token: string) {
    return this.jwt.verifyAsync<TokenPayload>(token, {
      issuer: this.issuer,
      audience: this.audience,
    });
  }

  verifyAccessTokenForRefresh(token: string) {
    return this.jwt.verifyAsync<TokenPayload>(token, {
      issuer: this.issuer,
      audience: this.audience,
      ignoreExpiration: true,
    });
  }
}
