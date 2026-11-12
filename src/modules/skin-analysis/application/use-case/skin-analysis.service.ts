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
  type AnalysisSessionStatus,
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
import {
  ANALYSIS_OUTBOX_PORT,
  type AnalysisOutboxPort,
} from '../ports/analysis-outbox.port.js';

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
    @Inject(ANALYSIS_OUTBOX_PORT)
    private readonly outbox: AnalysisOutboxPort,
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
  ): Promise<{ sessionId: Uuid; status: AnalysisSessionStatus }> {
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
    if (!claimed.created) {
      const existing = await this.sessions.findSession(userId, claimed.id);
      return { sessionId: claimed.id, status: existing?.status ?? 'QUEUED' };
    }
    let reservation: { id: Uuid } | null = null;
    const sessionId = claimed.id;
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
      if (
        !(await this.sessions.queueSession(sessionId, userId, {
          secureUrl,
          reservationId: reservation.id,
        }))
      ) {
        throw new Error('Analysis session could not be queued.');
      }
      reservation = null;
      return { sessionId, status: 'QUEUED' };
    } catch (error) {
      await this.sessions.failSession(sessionId, userId, errorCode(error));
      throw error;
    } finally {
      if (reservation) await this.quota.finalizeAnalysis(reservation.id, false);
    }
  }

  async processOutboxEvent(outboxId: Uuid): Promise<void> {
    const work = await this.outbox.findPublished(outboxId);
    if (!work) return;
    if (!(await this.sessions.markRunning(work.sessionId, work.userId))) return;

    let providerCalled = false;
    try {
      const image = await this.imageDownloader.download(work.secureUrl);
      providerCalled = true;
      const generated = await this.gemini.generateContent({
        prompt: SKIN_ANALYSIS_PROMPT,
        image,
      });
      const result = validateSkinAnalysisResult(generated.text);
      if (
        !(await this.persistResult(
          work.sessionId,
          work.userId,
          result,
          generated.model,
        ))
      )
        throw new Error('Analysis session could not be completed.');
    } catch (error) {
      await this.sessions.failSession(
        work.sessionId,
        work.userId,
        errorCode(error),
      );
      throw error;
    } finally {
      await this.quota.finalizeAnalysis(work.reservationId, providerCalled);
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
