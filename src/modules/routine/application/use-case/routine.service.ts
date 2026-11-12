import { Inject, Injectable } from '@nestjs/common';
import { HttpStatus } from '@nestjs/common';
import { BadRequestException } from '../../../../shared/handler/http.exceptions.js';
import { ApiException } from '../../../../shared/handler/http.exceptions.js';
import {
  ROUTINE_FINGERPRINT_PORT,
  type RoutineFingerprintPort,
} from '../ports/routine-fingerprint.port.js';
import type {
  Routine,
  RoutineStatus,
  RoutineStepInput,
} from '../../domain/routine.types.js';
import {
  ROUTINE_DATA_PORT,
  type RoutineDataPort,
  type RoutineDraftInput,
} from '../ports/routine-data.port.js';

@Injectable()
export class RoutineService {
  constructor(
    @Inject(ROUTINE_DATA_PORT) private readonly data: RoutineDataPort,
    @Inject(ROUTINE_FINGERPRINT_PORT)
    private readonly fingerprint: RoutineFingerprintPort,
  ) {}

  async createDraft(input: RoutineDraftInput): Promise<Routine> {
    if (!input.morning && !input.evening)
      throw new BadRequestException('Select at least one routine period.');
    const idempotencyKey = input.idempotencyKey.trim();
    if (!idempotencyKey || idempotencyKey.length > 255)
      throw new BadRequestException(
        'A valid Idempotency-Key header is required.',
      );
    const requestFingerprint = this.fingerprint.fingerprint(input);
    try {
      return await this.data.createDraft({
        ...input,
        idempotencyKey,
        requestFingerprint,
      });
    } catch (error) {
      if (
        error instanceof Error &&
        error.message === 'ROUTINE_ANALYSIS_NOT_AVAILABLE'
      )
        throw new ApiException(
          HttpStatus.NOT_FOUND,
          'Eligible analysis session was not found.',
          'ANALYSIS_SESSION_NOT_FOUND',
        );
      const databaseCode =
        typeof error === 'object' && error !== null && 'code' in error
          ? String(error.code)
          : undefined;
      if (
        error instanceof Error &&
        error.message === 'ROUTINE_IDEMPOTENCY_CONFLICT'
      )
        throw new ApiException(
          HttpStatus.CONFLICT,
          'Idempotency-Key was used with a different routine request.',
          'IDEMPOTENCY_KEY_CONFLICT',
        );
      if (
        error instanceof Error &&
        (error.message === 'ROUTINE_ALREADY_EXISTS' || databaseCode === '23505')
      )
        throw new ApiException(
          HttpStatus.CONFLICT,
          'A current routine already exists.',
          'ROUTINE_ALREADY_EXISTS',
        );
      throw error;
    }
  }
  async current(userId: string) {
    return this.data.getCurrent(userId);
  }
  async update(
    userId: string,
    id: string,
    input: {
      title?: string;
      morningSteps?: RoutineStepInput[];
      eveningSteps?: RoutineStepInput[];
    },
  ) {
    this.validateSteps(input.morningSteps, 'MORNING');
    this.validateSteps(input.eveningSteps, 'EVENING');
    const current = await this.requireOwned(userId, id);
    if (!['DRAFT', 'ACTIVE', 'PAUSED'].includes(current.status))
      throw new ApiException(
        HttpStatus.CONFLICT,
        'A completed routine cannot be edited.',
        'ROUTINE_COMPLETED',
      );
    let updated: Routine | null;
    try {
      updated = await this.data.updateDraft(userId, id, input);
    } catch (error) {
      if (
        error instanceof Error &&
        error.message === 'ROUTINE_PRODUCT_NOT_FOUND'
      )
        throw new ApiException(
          HttpStatus.NOT_FOUND,
          'Active catalog product was not found.',
          'PRODUCT_NOT_FOUND',
        );
      throw error;
    }
    if (updated) return updated;
    await this.requireOwned(userId, id);
    throw new ApiException(
      HttpStatus.CONFLICT,
      'Routine cannot be edited in its current state.',
      'ROUTINE_INVALID_TRANSITION',
    );
  }
  async activate(userId: string, id: string) {
    return this.change(userId, id, ['DRAFT', 'PAUSED'], 'ACTIVE');
  }
  async pause(userId: string, id: string) {
    return this.change(userId, id, ['ACTIVE'], 'PAUSED');
  }
  async complete(userId: string, id: string) {
    return this.change(userId, id, ['DRAFT', 'ACTIVE', 'PAUSED'], 'COMPLETED');
  }
  async today(userId: string, date: string) {
    return (
      this.data.getCheckIn(userId, date) ?? {
        date,
        completedStepIds: [],
        completionPercent: 0,
        streakDays: 0,
      }
    );
  }
  async checkIn(
    userId: string,
    date: string,
    completedStepIds: string[],
    note: string | null,
  ) {
    this.assertDate(date);
    const routine = await this.data.getCurrent(userId);
    if (!routine || routine.status !== 'ACTIVE')
      throw new ApiException(
        HttpStatus.CONFLICT,
        'An active routine is required for check-ins.',
        'ROUTINE_NOT_ACTIVE',
      );
    const allowed = new Set(
      [...routine.morningSteps, ...routine.eveningSteps].map((step) => step.id),
    );
    if (completedStepIds.some((id) => !allowed.has(id)))
      throw new BadRequestException(
        'A completed step does not belong to the current routine.',
      );
    return this.data.upsertCheckIn(
      userId,
      date,
      [...new Set(completedStepIds)],
      note,
    );
  }
  async history(userId: string, from: string, to: string) {
    this.assertDate(from);
    this.assertDate(to);
    if (from > to)
      throw new BadRequestException('from must not be later than to.');
    const rangeDays =
      (new Date(`${to}T00:00:00.000Z`).getTime() -
        new Date(`${from}T00:00:00.000Z`).getTime()) /
      86_400_000;
    if (rangeDays > 365)
      throw new BadRequestException(
        'Check-in history range must not exceed 366 days.',
      );
    return { items: await this.data.listCheckIns(userId, from, to) };
  }
  private async change(
    userId: string,
    id: string,
    from: RoutineStatus[],
    to: RoutineStatus,
  ) {
    const changed = await this.data.transition(userId, id, from, to);
    if (changed) return changed;
    await this.requireOwned(userId, id);
    throw new ApiException(
      HttpStatus.CONFLICT,
      `Routine cannot transition to ${to}.`,
      'ROUTINE_INVALID_TRANSITION',
    );
  }
  private async requireOwned(userId: string, id: string) {
    const routine = await this.data.getOwned(userId, id);
    if (!routine)
      throw new ApiException(
        HttpStatus.NOT_FOUND,
        'Routine was not found.',
        'ROUTINE_NOT_FOUND',
      );
    return routine;
  }

  private assertDate(value: string) {
    const parsed = new Date(`${value}T00:00:00.000Z`);
    if (
      !/^\d{4}-\d{2}-\d{2}$/.test(value) ||
      Number.isNaN(parsed.getTime()) ||
      parsed.toISOString().slice(0, 10) !== value
    ) {
      throw new BadRequestException('Date must be a valid YYYY-MM-DD value.');
    }
  }

  private validateSteps(
    steps: RoutineStepInput[] | undefined,
    period: 'MORNING' | 'EVENING',
  ) {
    if (!steps) return;
    if (steps.length > 8 || steps.some((step) => step.period !== period))
      throw new BadRequestException(
        `Routine steps must match the ${period.toLowerCase()} period and contain at most 8 steps.`,
      );
    const positions = steps.map((step) => step.position);
    if (new Set(positions).size !== positions.length)
      throw new BadRequestException(
        'Routine step positions must be unique within each period.',
      );
  }
}
