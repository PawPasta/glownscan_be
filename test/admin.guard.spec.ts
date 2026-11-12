import { describe, expect, it } from 'vitest';
import { AdminGuard } from '../src/shared/security/admin.guard.js';
import { ForbiddenException } from '../src/shared/handler/http.exceptions.js';

describe('AdminGuard', () => {
  const guard = new AdminGuard();

  it('permits authenticated administrators only', () => {
    const context = {
      switchToHttp: () => ({
        getRequest: () => ({ user: { roles: ['ADMIN'] } }),
      }),
    };
    expect(guard.canActivate(context as never)).toBe(true);
  });

  it('rejects non-administrators', () => {
    const context = {
      switchToHttp: () => ({
        getRequest: () => ({ user: { roles: ['USER'] } }),
      }),
    };
    expect(() => guard.canActivate(context as never)).toThrow(
      ForbiddenException,
    );
  });
});
