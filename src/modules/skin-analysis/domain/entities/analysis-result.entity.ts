import type {
  JsonObject,
  Uuid,
} from '../../../../shared/types/domain.types.js';
import type { AnalysisJsonValue } from './analysis-json.types.js';

export interface AnalysisResult {
  id: Uuid;
  sessionId: Uuid;
  qualityAccepted: boolean;
  qualityIssues: AnalysisJsonValue[];
  limitations: AnalysisJsonValue[];
  providerPayload: JsonObject;
  createdAt: Date;
}
