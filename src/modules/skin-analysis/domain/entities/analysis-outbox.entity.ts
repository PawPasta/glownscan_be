import type {
  JsonObject,
  Uuid,
} from '../../../../shared/types/domain.types.js';
import {
  AnalysisOutboxEventType,
  AnalysisOutboxStatus,
} from './enums/skin-analysis.enums.js';

export interface AnalysisOutbox {
  id: Uuid;
  sessionId: Uuid;
  eventType: AnalysisOutboxEventType;
  status: AnalysisOutboxStatus;
  payload: JsonObject;
  attemptCount: number;
  availableAt: Date;
  lockedAt: Date | null;
  processedAt: Date | null;
  createdAt: Date;
}
