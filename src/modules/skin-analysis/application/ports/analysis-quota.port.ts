import type { Uuid } from '../../../../shared/types/domain.types.js';

export interface AnalysisReservation {
  id: Uuid;
}

export interface AnalysisQuotaPort {
  reserveAnalysis(userId: Uuid): Promise<AnalysisReservation | null>;
  finalizeAnalysis(reservationId: Uuid, charge: boolean): Promise<void>;
}

export const ANALYSIS_QUOTA_PORT = Symbol('ANALYSIS_QUOTA_PORT');
