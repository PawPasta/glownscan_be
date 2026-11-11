import type { Uuid } from '../../../../shared/types/domain.types.js';

export interface AnalysisOutboxMessage {
  id: Uuid;
  sessionId: Uuid;
  userId: Uuid;
  secureUrl: string;
  reservationId: Uuid;
}

export interface AnalysisOutboxPort {
  claimAvailable(limit: number): Promise<AnalysisOutboxMessage[]>;
  markPublished(outboxId: Uuid): Promise<void>;
  release(outboxId: Uuid): Promise<void>;
  findPublished(outboxId: Uuid): Promise<AnalysisOutboxMessage | null>;
}

export const ANALYSIS_OUTBOX_PORT = Symbol('ANALYSIS_OUTBOX_PORT');
