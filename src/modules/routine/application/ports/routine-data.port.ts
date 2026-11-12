import type { Routine, RoutineStatus } from '../../domain/routine.types.js';

export const ROUTINE_DATA_PORT = Symbol('ROUTINE_DATA_PORT');

export interface RoutineDraftInput {
  userId: string;
  analysisSessionId: string | null;
  morning: boolean;
  evening: boolean;
  maxStepsPerRoutine: number;
  idempotencyKey: string;
}

export interface PersistRoutineDraftInput extends RoutineDraftInput {
  requestFingerprint: string;
}

export interface RoutineDataPort {
  createDraft(input: PersistRoutineDraftInput): Promise<Routine>;
  getCurrent(userId: string): Promise<Routine | null>;
  getOwned(userId: string, routineId: string): Promise<Routine | null>;
  updateDraft(
    userId: string,
    routineId: string,
    input: {
      title?: string;
      morningSteps?: unknown[];
      eveningSteps?: unknown[];
    },
  ): Promise<Routine | null>;
  transition(
    userId: string,
    routineId: string,
    from: RoutineStatus[],
    to: RoutineStatus,
  ): Promise<Routine | null>;
  upsertCheckIn(
    userId: string,
    date: string,
    completedStepIds: string[],
    note: string | null,
  ): Promise<{
    date: string;
    completedStepIds: string[];
    completionPercent: number;
    streakDays: number;
  }>;
  getCheckIn(
    userId: string,
    date: string,
  ): Promise<{
    date: string;
    completedStepIds: string[];
    completionPercent: number;
    streakDays: number;
  } | null>;
  listCheckIns(
    userId: string,
    from: string,
    to: string,
  ): Promise<
    Array<{
      date: string;
      completedStepIds: string[];
      completionPercent: number;
    }>
  >;
}
