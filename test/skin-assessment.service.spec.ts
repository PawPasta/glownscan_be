import { describe, expect, it, vi } from 'vitest';
import {
  CURRENT_QUESTIONNAIRE_VERSION,
  SkinAssessmentService,
} from '../src/modules/skin-analysis/application/use-case/skin-assessment.service.js';
import { BadRequestException } from '../src/shared/handler/http.exceptions.js';

describe('SkinAssessmentService', () => {
  const userId = '25bdca3a-e978-4bdb-96f3-51fb5b0413bc';

  it('saves the current assessment with the supported questionnaire version', async () => {
    const repository = { getCurrent: vi.fn(), saveCurrent: vi.fn() };
    const service = new SkinAssessmentService(repository);
    const answers = {
      skinType: 'COMBINATION' as const,
      sensitivity: 'NOT_SURE' as const,
      concerns: ['ACNE', 'OILINESS'] as const,
      goals: ['REDUCE_ACNE', 'OIL_CONTROL'] as const,
    };
    repository.saveCurrent.mockResolvedValue({ answers });

    await expect(service.saveCurrent(userId, answers)).resolves.toEqual({
      answers,
    });
    expect(repository.saveCurrent).toHaveBeenCalledWith(userId, {
      questionnaireVersion: CURRENT_QUESTIONNAIRE_VERSION,
      answers,
    });
  });

  it('rejects NONE when combined with a specific skin concern', () => {
    const repository = { getCurrent: vi.fn(), saveCurrent: vi.fn() };
    const service = new SkinAssessmentService(repository);

    expect(() =>
      service.saveCurrent(userId, {
        skinType: 'NORMAL',
        sensitivity: 'LOW',
        concerns: ['NONE', 'ACNE'],
        goals: ['MAINTAIN_HEALTHY_SKIN'],
      }),
    ).toThrow(BadRequestException);
    expect(repository.saveCurrent).not.toHaveBeenCalled();
  });
});
