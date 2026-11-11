import { Inject, Injectable } from '@nestjs/common';
import { NotFoundException } from '../../../../shared/handler/http.exceptions.js';
import type { Uuid } from '../../../../shared/types/domain.types.js';
import {
  CloudinaryUploadIntentService,
  type CloudinaryUploadConfirmation,
} from '../../../cloudinary/application/use-case/cloudinary-upload-intent.service.js';
import {
  GEMINI_GENERATIVE_MODEL_PORT,
  type GeminiGenerativeModelPort,
} from '../ports/gemini-generative-model.port.js';
import { SKIN_ANALYSIS_PROMPT } from '../prompts/skin-analysis.prompt.js';
import type { SkinAnalysisResult } from '../types/skin-analysis-result.js';
import { parseSkinAnalysisResult as validateSkinAnalysisResult } from '../validators/skin-analysis-result.validator.js';
import {
  ANALYSIS_QUOTA_PORT,
  type AnalysisQuotaPort,
} from '../ports/analysis-quota.port.js';
import { TooManyRequestsException } from '../../../../shared/handler/http.exceptions.js';
import {
  ANALYSIS_SESSION_PORT,
  type AnalysisSessionPort,
} from '../ports/analysis-session.port.js';
import { createHash, randomUUID } from 'node:crypto';
import {
  BadRequestException,
  ConflictException,
  UnprocessableEntityException,
} from '../../../../shared/handler/http.exceptions.js';
import {
  IMAGE_DOWNLOADER_PORT,
  type ImageDownloaderPort,
} from '../ports/image-downloader.port.js';

@Injectable()
export class SkinAnalysisService {
  constructor(
    @Inject(GEMINI_GENERATIVE_MODEL_PORT)
    private readonly gemini: GeminiGenerativeModelPort,
    private readonly cloudinary: CloudinaryUploadIntentService,
    @Inject(ANALYSIS_QUOTA_PORT) private readonly quota: AnalysisQuotaPort,
    @Inject(ANALYSIS_SESSION_PORT)
    private readonly sessions: AnalysisSessionPort,
    @Inject(IMAGE_DOWNLOADER_PORT)
    private readonly imageDownloader: ImageDownloaderPort,
  ) {}

  async createUploadIntent(userId: Uuid): Promise<{
    publicId: string;
    timestamp: number;
    signature: string;
    apiKey: string;
    cloudName: string;
  }> {
    return this.cloudinary.createSkinAnalysisUploadIntent(userId);
  }

  async analyzeCloudinaryImage(
    userId: Uuid,
    confirmation: CloudinaryUploadConfirmation,
    idempotencyKey?: string,
  ): Promise<SkinAnalysisResult & { sessionId: Uuid; status: 'SUCCEEDED' }> {
    if (idempotencyKey !== undefined && idempotencyKey.length > 255)
      throw new BadRequestException(
        'Idempotency-Key must not exceed 255 characters.',
      );
    const key = idempotencyKey ?? randomUUID();
    const fingerprint = createHash('sha256')
      .update(JSON.stringify(confirmation))
      .digest('hex');
    const claimed = await this.sessions.claimSession(userId, key, fingerprint);
    if (claimed.fingerprint !== fingerprint)
      throw new ConflictException(
        'Idempotency-Key was used with a different payload.',
      );
    if (!claimed.created)
      throw new ConflictException('Analysis is already being processed.');
    let reservation: { id: Uuid } | null = null;
    let providerCalled = false;
    let sessionId: Uuid | null = claimed.id;
    try {
      reservation = await this.quota.reserveAnalysis(userId);
      if (!reservation) {
        throw new TooManyRequestsException(
          'Your skin-analysis quota or concurrent-analysis limit has been reached. Please try again later.',
          60,
        );
      }
      const secureUrl = await this.cloudinary.confirmSkinAnalysisUpload(
        userId,
        confirmation,
      );
      const image = await this.imageDownloader.download(secureUrl);
      if (!(await this.sessions.markRunning(sessionId, userId))) {
        throw new Error('Analysis session could not start.');
      }
      providerCalled = true;
      const generated = await this.gemini.generateContent({
        prompt: SKIN_ANALYSIS_PROMPT,
        image,
      });
      const result = validateSkinAnalysisResult(generated.text);
      if (
        !(await this.persistResult(sessionId, userId, result, generated.model))
      ) {
        throw new Error('Analysis session could not be completed.');
      }
      return { ...result, sessionId, status: 'SUCCEEDED' };
    } catch (error) {
      if (sessionId)
        await this.sessions.failSession(sessionId, userId, errorCode(error));
      throw error;
    } finally {
      if (reservation)
        await this.quota.finalizeAnalysis(reservation.id, providerCalled);
    }
  }

  private async persistResult(
    sessionId: Uuid,
    userId: Uuid,
    result: SkinAnalysisResult,
    model: string,
  ): Promise<boolean> {
    let lastError: unknown;
    for (let attempt = 0; attempt < 3; attempt += 1) {
      try {
        return await this.sessions.completeSession(
          sessionId,
          userId,
          result,
          model,
        );
      } catch (error) {
        lastError = error;
        if (attempt < 2)
          await new Promise((resolve) =>
            setTimeout(resolve, 100 * 2 ** attempt),
          );
      }
    }
    throw lastError;
  }

  async getSession(userId: Uuid, sessionId: Uuid) {
    const session = await this.sessions.findSession(userId, sessionId);
    if (!session)
      throw new NotFoundException('Skin analysis session was not found.');
    return session;
  }

  listSessions(userId: Uuid, page: number, limit: number) {
    return this.sessions.listSessions(userId, limit, (page - 1) * limit);
  }
}

function errorCode(error: unknown): string {
  if (error instanceof UnprocessableEntityException)
    return 'ANALYSIS_INPUT_OR_PROVIDER_RESPONSE_INVALID';
  return 'ANALYSIS_PROCESSING_FAILED';
}
