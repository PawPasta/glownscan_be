import type { Uuid } from '../../../../shared/types/domain.types.js';

export const SKIN_ASSESSMENT_PORT = Symbol('SKIN_ASSESSMENT_PORT');

export interface SkinAssessmentRecord {
  questionnaireVersion: string;
  answers: SkinAssessmentAnswers;
  createdAt: Date;
  updatedAt: Date;
}

export interface SkinAssessmentAnswers {
  skinType: 'NORMAL' | 'DRY' | 'OILY' | 'COMBINATION' | 'NOT_SURE';
  sensitivity: 'LOW' | 'MEDIUM' | 'HIGH' | 'NOT_SURE';
  concerns: Array<
    | 'ACNE'
    | 'REDNESS'
    | 'DARK_SPOTS'
    | 'PORES'
    | 'DRYNESS'
    | 'OILINESS'
    | 'TEXTURE'
    | 'NONE'
  >;
  goals: Array<
    | 'REDUCE_ACNE'
    | 'EVEN_TONE'
    | 'HYDRATION'
    | 'OIL_CONTROL'
    | 'ANTI_AGING'
    | 'MAINTAIN_HEALTHY_SKIN'
  >;
}

export interface SkinAssessmentPort {
  getCurrent(userId: Uuid): Promise<SkinAssessmentRecord | null>;
  saveCurrent(
    userId: Uuid,
    assessment: Pick<SkinAssessmentRecord, 'questionnaireVersion' | 'answers'>,
  ): Promise<SkinAssessmentRecord>;
}
