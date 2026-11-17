import type { Uuid } from '../../../../shared/types/domain.types.js';
import type { AnalysisSessionStatus } from './analysis-session.port.js';

export interface AnalysisStatusEvent {
  userId: Uuid;
  sessionId: Uuid;
  status: AnalysisSessionStatus;
  errorCode: string | null;
  occurredAt: string;
}

export interface AnalysisStatusPublisherPort {
  publish(event: AnalysisStatusEvent): Promise<void>;
}

export const ANALYSIS_STATUS_PUBLISHER_PORT = Symbol(
  'ANALYSIS_STATUS_PUBLISHER_PORT',
);
