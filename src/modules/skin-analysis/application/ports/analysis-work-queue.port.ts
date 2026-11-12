import type { Uuid } from '../../../../shared/types/domain.types.js';

export interface AnalysisWorkQueuePort {
  publish(outboxId: Uuid): Promise<void>;
}

export const ANALYSIS_WORK_QUEUE_PORT = Symbol('ANALYSIS_WORK_QUEUE_PORT');
