import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import type { Request } from 'express';
import { UnauthorizedException } from '../handler/http.exceptions.js';
import type { SecurityContext } from './security.context.js';
import { AuthenticationService } from '../../modules/auth/application/use-case/authentication.service.js';

interface JwtClaims {
  sub: string;
  email: string;
  tokenVersion: number;
  roles: string[];
}

type AuthenticatedRequest = Request & { user?: SecurityContext };

@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly jwt: JwtService,
    private readonly authentication: AuthenticationService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const authorization = request.headers.authorization;
    const [scheme, token] = authorization?.split(' ') ?? [];
    if (scheme !== 'Bearer' || !token) {
      throw new UnauthorizedException('Bearer access token is required.');
    }

    let claims: JwtClaims;
    try {
      claims = await this.jwt.verifyAsync<JwtClaims>(token);
    } catch {
      throw new UnauthorizedException('Access token is invalid or expired.');
    }
    request.user = await this.authentication.validateAccessToken(claims);
    return true;
  }
}
