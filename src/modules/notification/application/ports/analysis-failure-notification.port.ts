import type { Uuid } from '../../../../shared/types/domain.types.js';

export const ANALYSIS_FAILURE_NOTIFICATION_PORT = Symbol(
  'ANALYSIS_FAILURE_NOTIFICATION_PORT',
);

export interface AnalysisFailureNotificationPort {
  notifyAnalysisFailed(userId: Uuid, sessionId: Uuid): Promise<void>;
}
