import type { Uuid } from '../../../../shared/types/domain.types.js';
import type { SkinAnalysisResult } from '../types/skin-analysis-result.js';

export type AnalysisSessionStatus =
  'QUEUED' | 'RUNNING' | 'SUCCEEDED' | 'FAILED';

export interface PersistedAnalysisSession {
  id: Uuid;
  status: AnalysisSessionStatus;
  createdAt: Date;
  completedAt: Date | null;
  result: SkinAnalysisResult | null;
  errorCode: string | null;
}

export interface AnalysisSessionPort {
  claimSession(
    userId: Uuid,
    key: string,
    fingerprint: string,
  ): Promise<{ id: Uuid; created: boolean; fingerprint: string }>;
  markRunning(sessionId: Uuid, userId: Uuid): Promise<boolean>;
  completeSession(
    sessionId: Uuid,
    userId: Uuid,
    result: SkinAnalysisResult,
    model: string,
  ): Promise<boolean>;
  failSession(sessionId: Uuid, userId: Uuid, errorCode: string): Promise<void>;
  findSession(
    userId: Uuid,
    sessionId: Uuid,
  ): Promise<PersistedAnalysisSession | null>;
  listSessions(
    userId: Uuid,
    limit: number,
    offset: number,
  ): Promise<{ items: PersistedAnalysisSession[]; total: number }>;
}

export const ANALYSIS_SESSION_PORT = Symbol('ANALYSIS_SESSION_PORT');
