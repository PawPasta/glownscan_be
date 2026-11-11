import { Inject, Injectable } from '@nestjs/common';
import { BadRequestException } from '../../../../shared/handler/http.exceptions.js';
import type { Uuid } from '../../../../shared/types/domain.types.js';
import {
  SKIN_ASSESSMENT_PORT,
  type SkinAssessmentAnswers,
  type SkinAssessmentPort,
} from '../ports/skin-assessment.port.js';

export const CURRENT_QUESTIONNAIRE_VERSION = 'skin-assessment-v1';

@Injectable()
export class SkinAssessmentService {
  constructor(
    @Inject(SKIN_ASSESSMENT_PORT)
    private readonly assessments: SkinAssessmentPort,
  ) {}

  getCurrent(userId: Uuid) {
    return this.assessments.getCurrent(userId);
  }

  saveCurrent(userId: Uuid, answers: SkinAssessmentAnswers) {
    if (answers.concerns.includes('NONE') && answers.concerns.length > 1) {
      throw new BadRequestException(
        'NONE cannot be combined with other skin concerns.',
      );
    }
    return this.assessments.saveCurrent(userId, {
      questionnaireVersion: CURRENT_QUESTIONNAIRE_VERSION,
      answers,
    });
  }
}
