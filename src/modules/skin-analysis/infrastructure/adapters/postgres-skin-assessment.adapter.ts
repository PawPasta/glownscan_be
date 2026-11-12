import { Injectable } from '@nestjs/common';
import { DatabaseService } from '../../../../shared/database/database.service.js';
import type { Uuid } from '../../../../shared/types/domain.types.js';
import type {
  SkinAssessmentPort,
  SkinAssessmentRecord,
} from '../../application/ports/skin-assessment.port.js';

@Injectable()
export class PostgresSkinAssessmentAdapter implements SkinAssessmentPort {
  constructor(private readonly database: DatabaseService) {}

  async getCurrent(userId: Uuid): Promise<SkinAssessmentRecord | null> {
    const result = await this.database.query<{
      questionnaire_version: string;
      answers: SkinAssessmentRecord['answers'];
      created_at: Date;
      updated_at: Date;
    }>(
      `SELECT questionnaire_version, answers, created_at, updated_at
       FROM app_skin_analysis.user_assessments WHERE user_id = $1`,
      [userId],
    );
    const record = result.rows[0];
    if (!record) return null;
    return {
      questionnaireVersion: record.questionnaire_version,
      answers: record.answers,
      createdAt: record.created_at,
      updatedAt: record.updated_at,
    };
  }

  async saveCurrent(
    userId: Uuid,
    assessment: Pick<SkinAssessmentRecord, 'questionnaireVersion' | 'answers'>,
  ): Promise<SkinAssessmentRecord> {
    const result = await this.database.query<{
      questionnaire_version: string;
      answers: SkinAssessmentRecord['answers'];
      created_at: Date;
      updated_at: Date;
    }>(
      `INSERT INTO app_skin_analysis.user_assessments (user_id, questionnaire_version, answers)
       VALUES ($1, $2, $3::jsonb)
       ON CONFLICT (user_id) DO UPDATE SET
         questionnaire_version = EXCLUDED.questionnaire_version,
         answers = EXCLUDED.answers,
         updated_at = CURRENT_TIMESTAMP
       RETURNING questionnaire_version, answers, created_at, updated_at`,
      [
        userId,
        assessment.questionnaireVersion,
        JSON.stringify(assessment.answers),
      ],
    );
    const record = result.rows[0];
    return {
      questionnaireVersion: record.questionnaire_version,
      answers: record.answers,
      createdAt: record.created_at,
      updatedAt: record.updated_at,
    };
  }
}
