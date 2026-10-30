import type { Uuid } from '../../../../shared/types/domain.types.js';
import { AnalysisConsentPurpose } from './enums/skin-analysis.enums.js';

export interface AnalysisConsent {
  id: Uuid;
  userId: Uuid;
  sessionId: Uuid;
  purpose: AnalysisConsentPurpose;
  consentVersion: string;
  acceptedAt: Date;
}
