import { describe, expect, it, vi } from 'vitest';
import { RateLimitGuard } from '../src/shared/rate-limit/rate-limit.guard.js';

function context(request: object) {
  return {
    getHandler: () => ({}),
    getClass: () => ({}),
    switchToHttp: () => ({ getRequest: () => request }),
  } as never;
}

describe('RateLimitGuard', () => {
  const options = {
    scope: 'test',
    key: 'USER' as const,
    limit: 2,
    windowSeconds: 60,
  };

  it('uses the authenticated user ID as the rate-limit subject', async () => {
    const reflector = { getAllAndOverride: vi.fn().mockReturnValue(options) };
    const rateLimit = {
      consume: vi
        .fn()
        .mockResolvedValue({ allowed: true, retryAfterSeconds: 10 }),
    };
    const guard = new RateLimitGuard(reflector as never, rateLimit as never);
    await expect(
      guard.canActivate(
        context({ user: { userId: 'user-a' }, ip: '127.0.0.1' }),
      ),
    ).resolves.toBe(true);
    expect(rateLimit.consume).toHaveBeenCalledWith('test', 'user-a', 2, 60);
  });

  it('returns a 429 with Retry-After metadata when the limit is exhausted', async () => {
    const reflector = { getAllAndOverride: vi.fn().mockReturnValue(options) };
    const rateLimit = {
      consume: vi
        .fn()
        .mockResolvedValue({ allowed: false, retryAfterSeconds: 23 }),
    };
    const guard = new RateLimitGuard(reflector as never, rateLimit as never);
    await expect(
      guard.canActivate(context({ user: { userId: 'user-a' } })),
    ).rejects.toMatchObject({ status: 429, retryAfterSeconds: 23 });
  });
});
