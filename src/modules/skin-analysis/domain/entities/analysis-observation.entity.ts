import type { Uuid } from '../../../../shared/types/domain.types.js';
import type { AnalysisJsonValue } from './analysis-json.types.js';
import {
  AnalysisObservationType,
  AnalysisObservationVisibility,
} from './enums/skin-analysis.enums.js';

export interface AnalysisObservation {
  id: Uuid;
  sessionId: Uuid;
  observationType: AnalysisObservationType;
  severity: number;
  confidence: number;
  visibility: AnalysisObservationVisibility;
  note: string | null;
  box2d: [number, number, number, number];
  mask: AnalysisJsonValue[] | null;
  displayOrder: number;
  createdAt: Date;
}
