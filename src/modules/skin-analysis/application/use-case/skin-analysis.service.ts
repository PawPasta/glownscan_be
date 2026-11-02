import { Inject, Injectable } from '@nestjs/common';
import { UnprocessableEntityException } from '../../../../shared/handler/http.exceptions.js';
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

const CLOUDINARY_IMAGE_MAX_BYTES = 10 * 1024 * 1024;
const CLOUDINARY_FETCH_TIMEOUT_MS = 30_000;
const ALLOWED_IMAGE_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);

@Injectable()
export class SkinAnalysisService {
  constructor(
    @Inject(GEMINI_GENERATIVE_MODEL_PORT)
    private readonly gemini: GeminiGenerativeModelPort,
    private readonly cloudinary: CloudinaryUploadIntentService,
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
  ): Promise<SkinAnalysisResult> {
    const secureUrl = await this.cloudinary.confirmSkinAnalysisUpload(
      userId,
      confirmation,
    );
    const image = await this.downloadImage(secureUrl);
    const generated = await this.gemini.generateContent({
      prompt: SKIN_ANALYSIS_PROMPT,
      image,
    });

    return parseSkinAnalysisResult(generated.text);
  }

  private async downloadImage(
    secureUrl: string,
  ): Promise<{ mimeType: string; data: Uint8Array }> {
    const response = await fetch(secureUrl, {
      method: 'GET',
      redirect: 'error',
      signal: AbortSignal.timeout(CLOUDINARY_FETCH_TIMEOUT_MS),
    });
    if (!response.ok) {
      throw new UnprocessableEntityException(
        `Cloudinary image download failed with HTTP ${response.status}.`,
      );
    }

    const mimeType = response.headers
      .get('content-type')
      ?.split(';', 1)[0]
      ?.trim()
      .toLowerCase();
    if (!mimeType || !ALLOWED_IMAGE_TYPES.has(mimeType)) {
      throw new UnprocessableEntityException(
        'The Cloudinary resource must be a JPEG, PNG, or WebP image.',
      );
    }

    const contentLength = Number(response.headers.get('content-length'));
    if (
      Number.isFinite(contentLength) &&
      contentLength > CLOUDINARY_IMAGE_MAX_BYTES
    ) {
      throw new UnprocessableEntityException(
        'The image must be 10 MB or smaller.',
      );
    }
    if (!response.body) {
      throw new UnprocessableEntityException(
        'Cloudinary returned an empty image.',
      );
    }

    const reader = response.body.getReader();
    const chunks: Uint8Array[] = [];
    let totalBytes = 0;
    while (true) {
      const { done, value } = await reader.read();
      if (done) {
        break;
      }
      totalBytes += value.byteLength;
      if (totalBytes > CLOUDINARY_IMAGE_MAX_BYTES) {
        await reader.cancel();
        throw new UnprocessableEntityException(
          'The image must be 10 MB or smaller.',
        );
      }
      chunks.push(value);
    }

    const data = new Uint8Array(totalBytes);
    let offset = 0;
    for (const chunk of chunks) {
      data.set(chunk, offset);
      offset += chunk.byteLength;
    }
    if (totalBytes === 0) {
      throw new UnprocessableEntityException(
        'Cloudinary returned an empty image.',
      );
    }
    return { mimeType, data };
  }
}

function parseSkinAnalysisResult(text: string): SkinAnalysisResult {
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch {
    throw new UnprocessableEntityException(
      'Gemini returned invalid JSON for the skin analysis.',
    );
  }
  if (!isSkinAnalysisResult(value)) {
    throw new UnprocessableEntityException(
      'Gemini returned a skin analysis with an invalid structure.',
    );
  }
  return value;
}

function isSkinAnalysisResult(value: unknown): value is SkinAnalysisResult {
  if (!isRecord(value) || value.schemaVersion !== '1.0') {
    return false;
  }
  const metrics = value.metrics;
  const regions = value.regions;
  if (
    !isRecord(value.quality) ||
    typeof value.quality.accepted !== 'boolean' ||
    !isStringArray(value.quality.issues) ||
    !isRecord(value.summary) ||
    !isIntegerInRange(value.summary.overallSkinScore, 0, 100) ||
    !isUnitInterval(value.summary.confidence) ||
    !isStringArray(value.summary.notes) ||
    !isSkinProfile(value.skinProfile) ||
    !isRecord(metrics) ||
    !isRecord(regions) ||
    !Array.isArray(value.observations) ||
    !Array.isArray(value.highlights) ||
    !isStringArray(value.limitations)
  ) {
    return false;
  }

  const metricNames = [
    'acne',
    'redness',
    'darkSpots',
    'pores',
    'dryness',
    'oiliness',
    'unevenTexture',
  ] as const;
  const regionNames = [
    'forehead',
    'leftCheek',
    'rightCheek',
    'nose',
    'chin',
  ] as const;
  return (
    metricNames.every((name) => isAssessment(metrics[name])) &&
    regionNames.every((name) => isAssessment(regions[name])) &&
    value.observations.every(isObservation) &&
    value.highlights.every(isHighlight)
  );
}

function isSkinProfile(value: unknown): boolean {
  const skinTypes = ['NORMAL', 'DRY', 'OILY', 'COMBINATION'];
  const sensitivityLevels = ['LOW', 'MEDIUM', 'HIGH'];
  return (
    isRecord(value) &&
    (value.skinType === null ||
      (typeof value.skinType === 'string' &&
        skinTypes.some((skinType) => skinType === value.skinType))) &&
    (value.sensitivityLevel === null ||
      (typeof value.sensitivityLevel === 'string' &&
        sensitivityLevels.some(
          (level) => level === value.sensitivityLevel,
        ))) &&
    (value.notes === null || typeof value.notes === 'string')
  );
}

function isAssessment(value: unknown): boolean {
  return (
    isRecord(value) &&
    isIntegerInRange(value.score, 0, 100) &&
    isUnitInterval(value.confidence) &&
    isVisibility(value.visibility)
  );
}

function isObservation(value: unknown): boolean {
  return (
    isRecord(value) &&
    [
      'VISIBLE_ACNE',
      'VISIBLE_REDNESS',
      'VISIBLE_DARK_SPOTS',
      'VISIBLE_PORES',
      'VISIBLE_DRYNESS',
      'VISIBLE_OILINESS',
      'UNEAVEN_TEXTURE',
    ].includes(String(value.type)) &&
    isIntegerInRange(value.severity, 0, 4) &&
    isUnitInterval(value.confidence) &&
    isVisibility(value.visibility) &&
    (value.note === null || typeof value.note === 'string') &&
    Array.isArray(value.box2d) &&
    value.box2d.length === 4 &&
    value.box2d.every((coordinate) => isIntegerInRange(coordinate, 0, 1000))
  );
}

function isHighlight(value: unknown): boolean {
  return (
    isRecord(value) &&
    [
      'acne',
      'redness',
      'darkSpots',
      'pores',
      'dryness',
      'oiliness',
      'unevenTexture',
    ].includes(String(value.type)) &&
    typeof value.label === 'string' &&
    value.label.length > 0 &&
    isIntegerInRange(value.x, 0, 1000) &&
    isIntegerInRange(value.y, 0, 1000) &&
    isIntegerInRange(value.radius, 1, 1000) &&
    isIntegerInRange(value.severity, 0, 4) &&
    isUnitInterval(value.confidence)
  );
}

function isVisibility(value: unknown): boolean {
  return ['CLEAR', 'UNCERTAIN', 'NOT_VISIBLE'].includes(String(value));
}

function isIntegerInRange(
  value: unknown,
  minimum: number,
  maximum: number,
): value is number {
  return (
    typeof value === 'number' &&
    Number.isInteger(value) &&
    value >= minimum &&
    value <= maximum
  );
}

function isUnitInterval(value: unknown): value is number {
  return (
    typeof value === 'number' &&
    Number.isFinite(value) &&
    value >= 0 &&
    value <= 1
  );
}

function isStringArray(value: unknown): value is string[] {
  return (
    Array.isArray(value) && value.every((item) => typeof item === 'string')
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}
