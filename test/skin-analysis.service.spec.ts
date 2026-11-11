import type { GeminiGenerativeModelPort } from '../src/modules/skin-analysis/application/ports/gemini-generative-model.port.js';
import { SkinAnalysisService } from '../src/modules/skin-analysis/application/use-case/skin-analysis.service.js';
import type { CloudinaryUploadIntentService } from '../src/modules/cloudinary/application/use-case/cloudinary-upload-intent.service.js';
import { NotFoundException } from '../src/shared/handler/http.exceptions.js';

const userId = 'c30d9edf-5a79-45da-ae83-5adf95610727';
const imageId = '9b829ac2-d13f-4964-83d3-01f7f0ddaa39';
const outboxId = '8decb573-a1bb-4c6c-975b-27bcb2a6e143';
const publicId = `glownscan/skin-analysis/${userId}/${imageId}`;
const secureUrl = `https://res.cloudinary.com/glow-test/image/upload/v123/glownscan/skin-analysis/${userId}/${imageId}.jpg`;
const confirmation = {
  publicId,
  version: 123,
  signature: 'cloudinary-response-signature',
  secureUrl,
};

function createService(overrides: Record<string, unknown> = {}) {
  const defaults = {
    gemini: { generateContent: vi.fn() },
    cloudinary: {
      createSkinAnalysisUploadIntent: vi.fn(),
      confirmSkinAnalysisUpload: vi.fn().mockResolvedValue(secureUrl),
    },
    quota: {
      reserveAnalysis: vi.fn().mockResolvedValue({ id: outboxId }),
      finalizeAnalysis: vi.fn().mockResolvedValue(undefined),
    },
    sessions: {
      claimSession: vi
        .fn()
        .mockImplementation((_userId, _key, fingerprint) => ({
          id: imageId,
          created: true,
          fingerprint,
        })),
      queueSession: vi.fn().mockResolvedValue(true),
      markRunning: vi.fn().mockResolvedValue(true),
      completeSession: vi.fn().mockResolvedValue(true),
      failSession: vi.fn().mockResolvedValue(undefined),
      findSession: vi.fn(),
      listSessions: vi.fn(),
    },
    imageDownloader: {
      download: vi.fn().mockResolvedValue({
        mimeType: 'image/jpeg',
        data: new Uint8Array([1, 2, 3]),
      }),
    },
    outbox: {
      findPublished: vi.fn().mockResolvedValue({
        id: outboxId,
        sessionId: imageId,
        userId,
        secureUrl,
        reservationId: outboxId,
      }),
    },
  };
  const dependencies = { ...defaults, ...overrides } as any;
  return {
    dependencies,
    service: new SkinAnalysisService(
      dependencies.gemini as GeminiGenerativeModelPort,
      dependencies.cloudinary as CloudinaryUploadIntentService,
      dependencies.quota,
      dependencies.sessions,
      dependencies.imageDownloader,
      dependencies.outbox,
    ),
  };
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
      notes: 'Visible estimate.',
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
  it('creates a signed upload intent for the authenticated user', async () => {
    const { service, dependencies } = createService();
    dependencies.cloudinary.createSkinAnalysisUploadIntent.mockResolvedValue({
      publicId,
      timestamp: 123,
      signature: 'intent-signature',
      apiKey: 'test-key',
      cloudName: 'glow-test',
    });
    await expect(service.createUploadIntent(userId)).resolves.toMatchObject({
      publicId,
      apiKey: 'test-key',
    });
  });

  it('verifies the upload, reserves quota, and queues analysis without calling Gemini', async () => {
    const { service, dependencies } = createService();
    await expect(
      service.analyzeCloudinaryImage(userId, confirmation, 'request-1'),
    ).resolves.toEqual({ sessionId: imageId, status: 'QUEUED' });
    expect(
      dependencies.cloudinary.confirmSkinAnalysisUpload,
    ).toHaveBeenCalledWith(userId, confirmation);
    expect(dependencies.sessions.queueSession).toHaveBeenCalledWith(
      imageId,
      userId,
      { secureUrl, reservationId: outboxId },
    );
    expect(dependencies.gemini.generateContent).not.toHaveBeenCalled();
    expect(dependencies.imageDownloader.download).not.toHaveBeenCalled();
    expect(dependencies.quota.finalizeAnalysis).not.toHaveBeenCalled();
  });

  it('returns the existing session for the same idempotency key without consuming an upload twice', async () => {
    const sessions = {
      claimSession: vi
        .fn()
        .mockImplementation((_userId, _key, fingerprint) => ({
          id: imageId,
          created: false,
          fingerprint,
        })),
      findSession: vi.fn().mockResolvedValue({ status: 'RUNNING' }),
    };
    const { service, dependencies } = createService({ sessions });
    await expect(
      service.analyzeCloudinaryImage(userId, confirmation, 'request-1'),
    ).resolves.toEqual({ sessionId: imageId, status: 'RUNNING' });
    expect(
      dependencies.cloudinary.confirmSkinAnalysisUpload,
    ).not.toHaveBeenCalled();
    expect(dependencies.quota.reserveAnalysis).not.toHaveBeenCalled();
  });

  it('returns 429 before consuming an upload intent when quota is unavailable', async () => {
    const quota = {
      reserveAnalysis: vi.fn().mockResolvedValue(null),
      finalizeAnalysis: vi.fn(),
    };
    const { service, dependencies } = createService({ quota });
    await expect(
      service.analyzeCloudinaryImage(userId, confirmation),
    ).rejects.toMatchObject({ status: 429, retryAfterSeconds: 60 });
    expect(
      dependencies.cloudinary.confirmSkinAnalysisUpload,
    ).not.toHaveBeenCalled();
  });

  it('releases a reservation and fails the session when durable queueing fails', async () => {
    const sessions = {
      claimSession: vi
        .fn()
        .mockImplementation((_userId, _key, fingerprint) => ({
          id: imageId,
          created: true,
          fingerprint,
        })),
      queueSession: vi.fn().mockResolvedValue(false),
      failSession: vi.fn().mockResolvedValue(undefined),
    };
    const { service, dependencies } = createService({ sessions });
    await expect(
      service.analyzeCloudinaryImage(userId, confirmation),
    ).rejects.toThrow('Analysis session could not be queued.');
    expect(dependencies.quota.finalizeAnalysis).toHaveBeenCalledWith(
      outboxId,
      false,
    );
    expect(dependencies.sessions.failSession).toHaveBeenCalledWith(
      imageId,
      userId,
      'ANALYSIS_PROCESSING_FAILED',
    );
  });

  it('worker downloads and persists a queued outbox event exactly once', async () => {
    const { service, dependencies } = createService();
    dependencies.gemini.generateContent.mockResolvedValue({
      text: JSON.stringify(analysisResult()),
      model: 'gemini-test',
    });
    await service.processOutboxEvent(outboxId);
    expect(dependencies.sessions.markRunning).toHaveBeenCalledWith(
      imageId,
      userId,
    );
    expect(dependencies.imageDownloader.download).toHaveBeenCalledWith(
      secureUrl,
    );
    expect(dependencies.sessions.completeSession).toHaveBeenCalledWith(
      imageId,
      userId,
      expect.any(Object),
      'gemini-test',
    );
    expect(dependencies.quota.finalizeAnalysis).toHaveBeenCalledWith(
      outboxId,
      true,
    );
  });

  it('does not call Gemini when a duplicate job cannot claim the session', async () => {
    const { service, dependencies } = createService();
    dependencies.sessions.markRunning.mockResolvedValue(false);
    await service.processOutboxEvent(outboxId);
    expect(dependencies.gemini.generateContent).not.toHaveBeenCalled();
    expect(dependencies.quota.finalizeAnalysis).not.toHaveBeenCalled();
  });

  it("does not disclose another user's analysis session", async () => {
    const { service, dependencies } = createService();
    dependencies.sessions.findSession.mockResolvedValue(null);
    await expect(service.getSession(userId, imageId)).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });
});
