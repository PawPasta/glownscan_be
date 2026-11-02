import type { Uuid } from '../../../../shared/types/domain.types.js';
import {
  AnalysisKind,
  AnalysisProvider,
  AnalysisSessionStatus,
} from './enums/skin-analysis.enums.js';

export interface AnalysisSession {
  id: Uuid;
  userId: Uuid;
  status: AnalysisSessionStatus;
  analysisKind: AnalysisKind;
  provider: AnalysisProvider;
  providerTaskId: string | null;
  modelVersion: string | null;
  promptVersion: string | null;
  resultSchemaVersion: string | null;
  rulesVersion: string | null;
  idempotencyKey: string | null;
  attemptCount: number;
  nextAttemptAt: Date | null;
  startedAt: Date | null;
  completedAt: Date | null;
  errorCode: string | null;
  errorMessage: string | null;
  createdAt: Date;
  updatedAt: Date;
}
