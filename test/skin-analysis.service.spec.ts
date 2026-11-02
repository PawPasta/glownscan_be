import type { GeminiGenerativeModelPort } from '../src/modules/skin-analysis/application/ports/gemini-generative-model.port.js';
import { SkinAnalysisService } from '../src/modules/skin-analysis/application/use-case/skin-analysis.service.js';
import type { CloudinaryUploadIntentService } from '../src/modules/cloudinary/application/use-case/cloudinary-upload-intent.service.js';

const userId = 'c30d9edf-5a79-45da-ae83-5adf95610727';
const imageId = '9b829ac2-d13f-4964-83d3-01f7f0ddaa39';
const publicId = `glownscan/skin-analysis/${userId}/${imageId}`;
const secureUrl = `https://res.cloudinary.com/glow-test/image/upload/v123/glownscan/skin-analysis/${userId}/${imageId}.jpg`;
const confirmation = {
  publicId,
  version: 123,
  signature: 'cloudinary-response-signature',
  secureUrl,
};

function createService(
  gemini: GeminiGenerativeModelPort,
  cloudinary: Pick<
    CloudinaryUploadIntentService,
    'createSkinAnalysisUploadIntent' | 'confirmSkinAnalysisUpload'
  > = {
    createSkinAnalysisUploadIntent: vi.fn().mockResolvedValue({
      publicId,
      timestamp: 123,
      signature: 'intent-signature',
      apiKey: 'test-key',
      cloudName: 'glow-test',
    }),
    confirmSkinAnalysisUpload: vi.fn().mockResolvedValue(secureUrl),
  },
) {
  return new SkinAnalysisService(
    gemini,
    cloudinary as CloudinaryUploadIntentService,
  );
}

function analysisResult() {
  const assessment = { score: 0, confidence: 0.9, visibility: 'CLEAR' };
  return {
    schemaVersion: '1.0',
    quality: { accepted: true, issues: [] },
    summary: { overallSkinScore: 90, confidence: 0.9, notes: [] },
    skinProfile: {
      skinType: 'NORMAL',
      sensitivityLevel: null,
      notes: 'Even-looking skin with no prominent visible dryness or oiliness.',
    },
    metrics: {
      acne: assessment,
      redness: assessment,
      darkSpots: assessment,
      pores: assessment,
      dryness: assessment,
      oiliness: assessment,
      unevenTexture: assessment,
    },
    regions: {
      forehead: assessment,
      leftCheek: assessment,
      rightCheek: assessment,
      nose: assessment,
      chin: assessment,
    },
    observations: [],
    highlights: [],
    limitations: ['Visual estimate only.'],
  };
}

describe('SkinAnalysisService', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('creates a signed, expiring Cloudinary upload intent for the user', async () => {
    const createSkinAnalysisUploadIntent = vi.fn().mockResolvedValue({
      publicId,
      timestamp: 123,
      signature: 'intent-signature',
      apiKey: 'test-key',
      cloudName: 'glow-test',
    });
    const service = createService(
      { generateContent: vi.fn() },
      { createSkinAnalysisUploadIntent, confirmSkinAnalysisUpload: vi.fn() },
    );

    const intent = await service.createUploadIntent(userId);

    expect(intent).toMatchObject({
      apiKey: 'test-key',
      cloudName: 'glow-test',
      publicId,
      timestamp: 123,
      signature: 'intent-signature',
    });
    expect(createSkinAnalysisUploadIntent).toHaveBeenCalledWith(userId);
  });

  it('downloads the user-owned Cloudinary image and sends it with the analysis prompt', async () => {
    const fetch = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(Buffer.from('image-data'), {
        headers: { 'content-type': 'image/jpeg' },
      }),
    );
    const generateContent = vi.fn().mockResolvedValue({
      text: JSON.stringify(analysisResult()),
      model: 'gemini-test',
      finishReason: 'STOP',
    });
    const gemini: GeminiGenerativeModelPort = { generateContent };
    const confirmSkinAnalysisUpload = vi.fn().mockResolvedValue(secureUrl);
    const cloudinary = {
      createSkinAnalysisUploadIntent: vi.fn(),
      confirmSkinAnalysisUpload,
    };
    const service = createService(gemini, cloudinary);

    await expect(
      service.analyzeCloudinaryImage(userId, confirmation),
    ).resolves.toMatchObject({
      schemaVersion: '1.0',
      summary: { overallSkinScore: 90 },
      skinProfile: { skinType: 'NORMAL', sensitivityLevel: null },
      highlights: [],
    });

    expect(fetch).toHaveBeenCalledWith(
      secureUrl,
      expect.objectContaining({ redirect: 'error' }),
    );
    expect(confirmSkinAnalysisUpload).toHaveBeenCalledWith(
      userId,
      confirmation,
    );
    expect(generateContent).toHaveBeenCalledWith({
      prompt: expect.stringContaining('"skinProfile"'),
      image: {
        mimeType: 'image/jpeg',
        data: new Uint8Array(Buffer.from('image-data')),
      },
    });
  });

  it('does not download an image when the shared Cloudinary intent is rejected', async () => {
    const fetch = vi.spyOn(globalThis, 'fetch');
    const confirmSkinAnalysisUpload = vi
      .fn()
      .mockRejectedValue(
        new Error('Cloudinary upload confirmation is invalid.'),
      );
    const service = createService(
      { generateContent: vi.fn() },
      {
        createSkinAnalysisUploadIntent: vi.fn(),
        confirmSkinAnalysisUpload,
      },
    );

    await expect(
      service.analyzeCloudinaryImage(userId, confirmation),
    ).rejects.toThrow('Cloudinary upload confirmation is invalid.');
    expect(fetch).not.toHaveBeenCalled();
    expect(confirmSkinAnalysisUpload).toHaveBeenCalledWith(
      userId,
      confirmation,
    );
  });

  it('rejects a response that does not match the analysis result contract', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(Buffer.from('image-data'), {
        headers: { 'content-type': 'image/jpeg' },
      }),
    );
    const service = createService({
      generateContent: vi.fn().mockResolvedValue({
        text: '{"schemaVersion":"1.0"}',
        model: 'gemini-test',
        finishReason: 'STOP',
      }),
    });

    await expect(
      service.analyzeCloudinaryImage(userId, confirmation),
    ).rejects.toThrow(
      'Gemini returned a skin analysis with an invalid structure.',
    );
  });
});
