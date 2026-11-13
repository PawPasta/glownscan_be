import { validate } from 'class-validator';
import { CreateSkinAnalysisUploadIntentDto } from '../src/modules/skin-analysis/presentation/skin-analysis.dto.js';

describe('CreateSkinAnalysisUploadIntentDto', () => {
  it('requires an explicit consent acknowledgement', async () => {
    const missing = Object.assign(new CreateSkinAnalysisUploadIntentDto(), {});
    const rejected = Object.assign(new CreateSkinAnalysisUploadIntentDto(), {
      consentAccepted: false,
    });
    const accepted = Object.assign(new CreateSkinAnalysisUploadIntentDto(), {
      consentAccepted: true,
    });

    expect(await validate(missing)).not.toHaveLength(0);
    expect(await validate(rejected)).not.toHaveLength(0);
    expect(await validate(accepted)).toHaveLength(0);
  });
});
