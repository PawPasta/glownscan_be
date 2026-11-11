import type { GeminiGenerativeModelPort } from '../src/modules/skin-analysis/application/ports/gemini-generative-model.port.js';
import { SkinAnalysisService } from '../src/modules/skin-analysis/application/use-case/skin-analysis.service.js';
import type { CloudinaryUploadIntentService } from '../src/modules/cloudinary/application/use-case/cloudinary-upload-intent.service.js';
import { NotFoundException } from '../src/shared/handler/http.exceptions.js';

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
  quota = {
    reserveAnalysis: vi.fn().mockResolvedValue({ id: imageId }),
    finalizeAnalysis: vi.fn().mockResolvedValue(undefined),
  },
  sessions = {
    claimSession: vi.fn().mockImplementation((_userId, _key, fingerprint) => ({
      id: imageId,
      created: true,
      fingerprint,
    })),
    markRunning: vi.fn().mockResolvedValue(true),
    completeSession: vi.fn().mockResolvedValue(true),
    failSession: vi.fn().mockResolvedValue(undefined),
    findSession: vi.fn(),
    listSessions: vi.fn(),
  },
  imageDownloader = {
    download: vi.fn().mockResolvedValue({
      mimeType: 'image/jpeg',
      data: new Uint8Array([1, 2, 3]),
    }),
  },
) {
  return new SkinAnalysisService(
    gemini,
    cloudinary as CloudinaryUploadIntentService,
    quota,
    sessions,
    imageDownloader,
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
    const download = vi.fn().mockResolvedValue({
      mimeType: 'image/jpeg',
      data: new Uint8Array(Buffer.from('image-data')),
    });
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
    const service = createService(gemini, cloudinary, undefined, undefined, {
      download,
    });

    await expect(
      service.analyzeCloudinaryImage(userId, confirmation),
    ).resolves.toMatchObject({
      sessionId: imageId,
      status: 'SUCCEEDED',
      schemaVersion: '1.0',
      summary: { overallSkinScore: 90 },
      skinProfile: { skinType: 'NORMAL', sensitivityLevel: null },
      highlights: [],
    });

    expect(download).toHaveBeenCalledWith(secureUrl);
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
    const download = vi.fn();
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
      undefined,
      undefined,
      { download },
    );

    await expect(
      service.analyzeCloudinaryImage(userId, confirmation),
    ).rejects.toThrow('Cloudinary upload confirmation is invalid.');
    expect(download).not.toHaveBeenCalled();
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

  it('returns 429 before consuming an upload intent when the quota is unavailable', async () => {
    const confirmSkinAnalysisUpload = vi.fn();
    const quota = {
      reserveAnalysis: vi.fn().mockResolvedValue(null),
      finalizeAnalysis: vi.fn(),
    };
    const service = createService(
      { generateContent: vi.fn() },
      { createSkinAnalysisUploadIntent: vi.fn(), confirmSkinAnalysisUpload },
      quota,
    );

    await expect(
      service.analyzeCloudinaryImage(userId, confirmation),
    ).rejects.toMatchObject({ status: 429, retryAfterSeconds: 60 });
    expect(confirmSkinAnalysisUpload).not.toHaveBeenCalled();
  });

  it('marks a created session as failed when the provider fails', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(Buffer.from('image-data'), {
        headers: { 'content-type': 'image/jpeg' },
      }),
    );
    const sessions = {
      claimSession: vi
        .fn()
        .mockImplementation((_userId, _key, fingerprint) => ({
          id: imageId,
          created: true,
          fingerprint,
        })),
      markRunning: vi.fn().mockResolvedValue(true),
      completeSession: vi.fn(),
      failSession: vi.fn().mockResolvedValue(undefined),
      findSession: vi.fn(),
      listSessions: vi.fn(),
    };
    const service = createService(
      {
        generateContent: vi
          .fn()
          .mockRejectedValue(new Error('provider unavailable')),
      },
      undefined,
      undefined,
      sessions,
    );

    await expect(
      service.analyzeCloudinaryImage(userId, confirmation),
    ).rejects.toThrow('provider unavailable');
    expect(sessions.claimSession).toHaveBeenCalledWith(
      userId,
      expect.any(String),
      expect.any(String),
    );
    expect(sessions.markRunning).toHaveBeenCalledWith(imageId, userId);
    expect(sessions.failSession).toHaveBeenCalledWith(
      imageId,
      userId,
      'ANALYSIS_PROCESSING_FAILED',
    );
  });

  it('retries transactional result persistence after a transient database failure', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(Buffer.from('image-data'), {
        headers: { 'content-type': 'image/jpeg' },
      }),
    );
    const sessions = {
      claimSession: vi
        .fn()
        .mockImplementation((_userId, _key, fingerprint) => ({
          id: imageId,
          created: true,
          fingerprint,
        })),
      markRunning: vi.fn().mockResolvedValue(true),
      completeSession: vi
        .fn()
        .mockRejectedValueOnce(new Error('database unavailable'))
        .mockResolvedValueOnce(true),
      failSession: vi.fn(),
      findSession: vi.fn(),
      listSessions: vi.fn(),
    };
    const service = createService(
      {
        generateContent: vi.fn().mockResolvedValue({
          text: JSON.stringify(analysisResult()),
          model: 'test',
          finishReason: 'STOP',
        }),
      },
      undefined,
      undefined,
      sessions,
    );

    await expect(
      service.analyzeCloudinaryImage(userId, confirmation),
    ).resolves.toMatchObject({ sessionId: imageId });
    expect(sessions.completeSession).toHaveBeenCalledTimes(2);
  });

  it('charges exactly one reserved concurrent analysis and rejects the other request', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(Buffer.from('image-data'), {
        headers: { 'content-type': 'image/jpeg' },
      }),
    );
    const quota = {
      reserveAnalysis: vi
        .fn()
        .mockResolvedValueOnce({ id: imageId })
        .mockResolvedValueOnce(null),
      finalizeAnalysis: vi.fn().mockResolvedValue(undefined),
    };
    const service = createService(
      {
        generateContent: vi.fn().mockResolvedValue({
          text: JSON.stringify(analysisResult()),
          model: 'test',
          finishReason: 'STOP',
        }),
      },
      undefined,
      quota,
    );

    const results = await Promise.allSettled([
      service.analyzeCloudinaryImage(userId, confirmation),
      service.analyzeCloudinaryImage(userId, confirmation),
    ]);

    expect(
      results.filter((result) => result.status === 'fulfilled'),
    ).toHaveLength(1);
    expect(
      results.filter((result) => result.status === 'rejected'),
    ).toHaveLength(1);
    expect(quota.finalizeAnalysis).toHaveBeenCalledWith(imageId, true);
  });

  it("does not disclose a different user's analysis session", async () => {
    const otherUserId = '4584dbd0-b48f-4630-a474-e6ef81b25c83';
    const sessions = {
      claimSession: vi.fn(),
      markRunning: vi.fn(),
      completeSession: vi.fn(),
      failSession: vi.fn(),
      findSession: vi.fn().mockResolvedValue(null),
      listSessions: vi.fn(),
    };
    const service = createService(undefined, undefined, undefined, sessions);

    await expect(
      service.getSession(otherUserId, imageId),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(sessions.findSession).toHaveBeenCalledWith(otherUserId, imageId);
  });
});
