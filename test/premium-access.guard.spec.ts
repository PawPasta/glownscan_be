import { describe, expect, it, vi } from 'vitest';
import { PaymentService } from '../src/modules/payment/application/use-case/payment.service.js';
import { AccessPermissionGuard } from '../src/shared/security/access-permission.guard.js';
import { ApiException } from '../src/shared/handler/http.exceptions.js';

function executionContext(user?: { userId: string; roles: string[] }) {
  return {
    switchToHttp: () => ({ getRequest: () => ({ user }) }),
    getHandler: () => 'handler',
    getClass: () => 'controller',
  } as never;
}

function createGuard(
  permission: string,
  hasPermission: ReturnType<typeof vi.fn>,
) {
  const reflector = {
    getAllAndOverride: vi.fn().mockReturnValue(permission),
  };
  const payment = { hasPermission } as unknown as PaymentService;
  return new AccessPermissionGuard(reflector as never, payment);
}

describe('AccessPermissionGuard', () => {
  it('allows ADMIN without querying permissions', async () => {
    const hasPermission = vi.fn();
    const guard = createGuard('ROUTINE_MANAGE', hasPermission);

    await expect(
      guard.canActivate(
        executionContext({ userId: 'admin-id', roles: ['ADMIN'] }),
      ),
    ).resolves.toBe(true);
    expect(hasPermission).not.toHaveBeenCalled();
  });

  it('allows a user granted the capability by a role or active package', async () => {
    const hasPermission = vi.fn().mockResolvedValue(true);
    const guard = createGuard('ROUTINE_MANAGE', hasPermission);

    await expect(
      guard.canActivate(
        executionContext({ userId: 'premium-id', roles: ['USER'] }),
      ),
    ).resolves.toBe(true);
    expect(hasPermission).toHaveBeenCalledWith('premium-id', 'ROUTINE_MANAGE');
  });

  it('returns the stable PREMIUM_REQUIRED error for a free user', async () => {
    const hasPermission = vi.fn().mockResolvedValue(false);
    const guard = createGuard('RECOMMENDATION_READ', hasPermission);

    const error = await guard
      .canActivate(executionContext({ userId: 'free-id', roles: ['USER'] }))
      .catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(ApiException);
    expect((error as ApiException).getStatus()).toBe(403);
    expect((error as ApiException).getResponse()).toMatchObject({
      code: 'PREMIUM_REQUIRED',
    });
  });

  it('uses a generic permission error when the basic role grant is missing', async () => {
    const guard = createGuard(
      'SKIN_ANALYSIS_BASIC',
      vi.fn().mockResolvedValue(false),
    );
    const error = await guard
      .canActivate(executionContext({ userId: 'user-id', roles: ['USER'] }))
      .catch((caught: unknown) => caught);

    expect((error as ApiException).getResponse()).toMatchObject({
      code: 'PERMISSION_REQUIRED',
    });
  });
});
