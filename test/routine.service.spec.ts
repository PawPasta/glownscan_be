import { describe, expect, it, vi } from 'vitest';
import { RoutineService } from '../src/modules/routine/application/use-case/routine.service.js';
import type { RoutineDataPort } from '../src/modules/routine/application/ports/routine-data.port.js';

const routine = {
  id: 'routine-1',
  title: 'Daily routine',
  status: 'ACTIVE' as const,
  morningSteps: [
    {
      id: 'step-1',
      period: 'MORNING' as const,
      position: 1,
      title: 'Cleanse',
      instruction: 'Gently cleanse.',
      optional: false,
      product: null,
    },
  ],
  eveningSteps: [],
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
  activatedAt: null,
  completedAt: null,
};

function makeService(overrides: Partial<RoutineDataPort> = {}) {
  const data = {
    createDraft: vi.fn(),
    getCurrent: vi.fn().mockResolvedValue(routine),
    getOwned: vi.fn().mockResolvedValue(routine),
    updateDraft: vi.fn(),
    transition: vi.fn(),
    upsertCheckIn: vi.fn(),
    getCheckIn: vi.fn(),
    listCheckIns: vi.fn(),
    ...overrides,
  } as unknown as RoutineDataPort;
  return {
    service: new RoutineService(data, {
      fingerprint: () => 'a'.repeat(64),
    }),
    data,
  };
}

describe('RoutineService', () => {
  it('requires an idempotency key before creating a routine draft', async () => {
    const createDraft = vi.fn();
    const { service } = makeService({ createDraft });
    await expect(
      service.createDraft({
        userId: 'user-1',
        analysisSessionId: null,
        morning: true,
        evening: false,
        maxStepsPerRoutine: 4,
        idempotencyKey: '',
      }),
    ).rejects.toMatchObject({ status: 400 });
    expect(createDraft).not.toHaveBeenCalled();
  });

  it('rejects check-in step IDs that do not belong to the current routine', async () => {
    const upsertCheckIn = vi.fn();
    const { service } = makeService({ upsertCheckIn });
    await expect(
      service.checkIn('user-1', '2026-11-12', ['other-step'], null),
    ).rejects.toMatchObject({ status: 400 });
    expect(upsertCheckIn).not.toHaveBeenCalled();
  });

  it('enforces only allowed routine state transitions through persistence', async () => {
    const transition = vi.fn().mockResolvedValue(null);
    const { service } = makeService({ transition });
    await expect(service.pause('user-1', 'routine-1')).rejects.toMatchObject({
      status: 409,
    });
    expect(transition).toHaveBeenCalledWith(
      'user-1',
      'routine-1',
      ['ACTIVE'],
      'PAUSED',
    );
  });

  it('does not allow a user to load another account routine', async () => {
    const { service } = makeService({
      getOwned: vi.fn().mockResolvedValue(null),
    });
    await expect(
      service.update('user-2', 'routine-1', { title: 'Changed' }),
    ).rejects.toMatchObject({ status: 404 });
  });
});
