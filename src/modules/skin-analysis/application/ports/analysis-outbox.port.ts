import type { Uuid } from '../../../../shared/types/domain.types.js';

export interface AnalysisOutboxMessage {
  id: Uuid;
  sessionId: Uuid;
  userId: Uuid;
  secureUrl: string;
  publicId: string;
  reservationId: Uuid;
  providerCalled: boolean;
  cleanupErrorCode: string | null;
}

export interface AnalysisOutboxPort {
  claimAvailable(limit: number): Promise<AnalysisOutboxMessage[]>;
  markPublished(outboxId: Uuid): Promise<void>;
  release(outboxId: Uuid): Promise<void>;
  findPublished(outboxId: Uuid): Promise<AnalysisOutboxMessage | null>;
  markProviderCalled(outboxId: Uuid): Promise<void>;
  markCleanupRequired(outboxId: Uuid, errorCode: string): Promise<void>;
}

export const ANALYSIS_OUTBOX_PORT = Symbol('ANALYSIS_OUTBOX_PORT');
