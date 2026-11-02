import type {
  JsonObject,
  Uuid,
} from '../../../../shared/types/domain.types.js';

export interface AssessmentSnapshot {
  id: Uuid;
  sessionId: Uuid;
  questionnaireVersion: string;
  answers: JsonObject;
  createdAt: Date;
}
