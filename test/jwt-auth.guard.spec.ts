import { ExecutionContext } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { describe, expect, it, vi } from 'vitest';
import { AuthenticationService } from '../src/modules/auth/application/use-case/authentication.service.js';
import { JwtAuthGuard } from '../src/shared/security/jwt-auth.guard.js';
import { UnauthorizedException } from '../src/shared/handler/http.exceptions.js';

const user = {
  userId: '25bdca3a-e978-4bdb-96f3-51fb5b0413bc',
  email: 'user@example.com',
  tokenVersion: 1,
  roles: ['USER'],
};

function context(headers: Record<string, string | undefined>) {
  const request = { headers };
  return {
    switchToHttp: () => ({ getRequest: () => request }),
    request,
  };
}

describe('JwtAuthGuard', () => {
  it('rejects a missing bearer token before accessing application data', async () => {
    const auth = { validateAccessToken: vi.fn() };
    const guard = new JwtAuthGuard(
      { verifyAsync: vi.fn() } as unknown as JwtService,
      auth as unknown as AuthenticationService,
    );

    await expect(
      guard.canActivate(context({}) as unknown as ExecutionContext),
    ).rejects.toBeInstanceOf(UnauthorizedException);
    expect(auth.validateAccessToken).not.toHaveBeenCalled();
  });

  it('rejects expired, replayed, or invalid JWTs when verification fails', async () => {
    const auth = { validateAccessToken: vi.fn() };
    const jwt = {
      verifyAsync: vi.fn().mockRejectedValue(new Error('expired')),
    };
    const guard = new JwtAuthGuard(
      jwt as unknown as JwtService,
      auth as unknown as AuthenticationService,
    );

    await expect(
      guard.canActivate(
        context({
          authorization: 'Bearer expired-token',
        }) as unknown as ExecutionContext,
      ),
    ).rejects.toBeInstanceOf(UnauthorizedException);
    expect(auth.validateAccessToken).not.toHaveBeenCalled();
  });

  it('loads current server-side identity and never trusts claims as authorization', async () => {
    const auth = { validateAccessToken: vi.fn().mockResolvedValue(user) };
    const jwt = {
      verifyAsync: vi.fn().mockResolvedValue({
        sub: user.userId,
        email: user.email,
        tokenVersion: 1,
        roles: ['ADMIN'],
      }),
    };
    const requestContext = context({ authorization: 'Bearer valid-token' });
    const guard = new JwtAuthGuard(
      jwt as unknown as JwtService,
      auth as unknown as AuthenticationService,
    );

    await expect(
      guard.canActivate(requestContext as unknown as ExecutionContext),
    ).resolves.toBe(true);
    expect(requestContext.request).toMatchObject({ user });
    expect(auth.validateAccessToken).toHaveBeenCalledWith(
      expect.objectContaining({ sub: user.userId }),
    );
  });
});
