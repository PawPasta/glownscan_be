import { Inject, Injectable, Logger } from '@nestjs/common';
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
  type AnalysisSessionView,
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
import {
  ANALYSIS_FAILURE_NOTIFICATION_PORT,
  type AnalysisFailureNotificationPort,
} from '../../../notification/application/ports/analysis-failure-notification.port.js';
import {
  ANALYSIS_STATUS_PUBLISHER_PORT,
  type AnalysisStatusPublisherPort,
} from '../ports/analysis-status-publisher.port.js';

@Injectable()
export class SkinAnalysisService {
  private static readonly CONSENT_VERSION = 'skin-analysis-consent-v1';
  private readonly logger = new Logger(SkinAnalysisService.name);
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
    @Inject(ANALYSIS_FAILURE_NOTIFICATION_PORT)
    private readonly failureNotification: AnalysisFailureNotificationPort,
    @Inject(ANALYSIS_STATUS_PUBLISHER_PORT)
    private readonly statusPublisher: AnalysisStatusPublisherPort,
  ) {}

  async createUploadIntent(
    userId: Uuid,
    consentAccepted: boolean,
  ): Promise<{
    publicId: string;
    timestamp: number;
    signature: string;
    apiKey: string;
    cloudName: string;
    consentVersion: string;
  }> {
    if (!consentAccepted)
      throw new BadRequestException('Skin-analysis consent is required.');
    return this.cloudinary.createSkinAnalysisUploadIntent(
      userId,
      SkinAnalysisService.CONSENT_VERSION,
    );
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
      const upload = await this.cloudinary.confirmSkinAnalysisUpload(
        userId,
        confirmation,
      );
      if (
        !(await this.sessions.queueSession(sessionId, userId, {
          secureUrl: upload.secureUrl,
          publicId: upload.publicId,
          consentVersion: upload.consentVersion,
          reservationId: reservation.id,
        }))
      ) {
        throw new Error('Analysis session could not be queued.');
      }
      reservation = null;
      await this.publishStatus(userId, sessionId, 'QUEUED');
      return { sessionId, status: 'QUEUED' };
    } catch (error) {
      await this.sessions.failSession(sessionId, userId, errorCode(error));
      await this.publishStatus(userId, sessionId, 'FAILED', errorCode(error));
      throw error;
    } finally {
      if (reservation) await this.quota.finalizeAnalysis(reservation.id, false);
    }
  }

  async processOutboxEvent(
    outboxId: Uuid,
    attemptNumber = 1,
    maxAttempts = 6,
  ): Promise<void> {
    const work = await this.outbox.findPublished(outboxId);
    if (!work) return;
    if (!(await this.sessions.markRunning(work.sessionId, work.userId))) return;
    await this.publishStatus(work.userId, work.sessionId, 'RUNNING');

    if (attemptNumber > 3) {
      try {
        await this.cleanupFailedAnalysis(
          work,
          work.cleanupErrorCode ?? 'ANALYSIS_PROCESSING_FAILED',
        );
        await this.quota.finalizeAnalysis(
          work.reservationId,
          work.providerCalled,
        );
      } catch (cleanupError) {
        if (attemptNumber < maxAttempts) {
          await this.sessions.retrySession(work.sessionId, work.userId);
          await this.publishStatus(work.userId, work.sessionId, 'QUEUED');
          throw cleanupError;
        }
        this.logger.error(
          'Terminal analysis data cleanup failed; manual reconciliation is required.',
        );
        throw cleanupError;
      }
      return;
    }

    try {
      const image = await this.imageDownloader.download(work.secureUrl);
      await this.outbox.markProviderCalled(work.id);
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
      if (attemptNumber === 3)
        await this.outbox.markCleanupRequired(work.id, errorCode(error));
      await this.sessions.retrySession(work.sessionId, work.userId);
      await this.publishStatus(work.userId, work.sessionId, 'QUEUED');
      throw error;
    }
    await this.quota.finalizeAnalysis(work.reservationId, true);
    await this.publishStatus(work.userId, work.sessionId, 'SUCCEEDED');
  }

  private async cleanupFailedAnalysis(
    work: NonNullable<Awaited<ReturnType<AnalysisOutboxPort['findPublished']>>>,
    code: string,
  ) {
    await this.cloudinary.deleteSkinAnalysisImage(work.userId, work.publicId);
    await this.sessions.failSessionAndPurgeData(
      work.sessionId,
      work.userId,
      code,
    );
    await this.publishStatus(work.userId, work.sessionId, 'FAILED', code);
    try {
      await this.failureNotification.notifyAnalysisFailed(
        work.userId,
        work.sessionId,
      );
    } catch {
      this.logger.warn(
        'Could not dispatch terminal skin-analysis notification.',
      );
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

  async getSession(
    userId: Uuid,
    sessionId: Uuid,
    canViewPremiumDetails = false,
  ): Promise<AnalysisSessionView> {
    const session = await this.sessions.findSession(userId, sessionId);
    if (!session)
      throw new NotFoundException('Skin analysis session was not found.');
    return this.applyResultVisibility(session, canViewPremiumDetails);
  }

  async listSessions(
    userId: Uuid,
    page: number,
    limit: number,
    canViewPremiumDetails = false,
  ) {
    const history = await this.sessions.listSessions(
      userId,
      limit,
      (page - 1) * limit,
    );
    return {
      ...history,
      items: history.items.map((session) =>
        this.applyResultVisibility(session, canViewPremiumDetails),
      ),
    };
  }

  private applyResultVisibility(
    session: NonNullable<
      Awaited<ReturnType<AnalysisSessionPort['findSession']>>
    >,
    canViewPremiumDetails: boolean,
  ): AnalysisSessionView {
    if (canViewPremiumDetails || !session.result) return session;
    return {
      ...session,
      result: {
        quality: session.result.quality,
        summary: session.result.summary,
        premiumRequired: true,
      },
    };
  }

  private async publishStatus(
    userId: Uuid,
    sessionId: Uuid,
    status: AnalysisSessionStatus,
    errorCode: string | null = null,
  ): Promise<void> {
    try {
      await this.statusPublisher.publish({
        userId,
        sessionId,
        status,
        errorCode,
        occurredAt: new Date().toISOString(),
      });
    } catch {
      this.logger.warn(
        `Could not publish analysis status event for session ${sessionId}.`,
      );
    }
  }
}

function errorCode(error: unknown): string {
  if (error instanceof UnprocessableEntityException)
    return 'ANALYSIS_INPUT_OR_PROVIDER_RESPONSE_INVALID';
  return 'ANALYSIS_PROCESSING_FAILED';
}
