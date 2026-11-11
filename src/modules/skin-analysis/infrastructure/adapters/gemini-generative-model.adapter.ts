import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type {
  GeminiGenerationRequest,
  GeminiGenerationResult,
  GeminiGenerativeModelPort,
} from '../../application/ports/gemini-generative-model.port.js';

const DEFAULT_GEMINI_API_BASE_URL =
  'https://generativelanguage.googleapis.com/v1beta/models';
const DEFAULT_GEMINI_REQUEST_TIMEOUT_MS = 60_000;

export class GeminiRequestError extends Error {
  constructor(
    readonly code: string,
    readonly retryable: boolean,
    message: string,
  ) {
    super(message);
    this.name = 'GeminiRequestError';
  }
}

@Injectable()
export class GeminiGenerativeModelAdapter implements GeminiGenerativeModelPort {
  constructor(private readonly config: ConfigService) {}

  async generateContent(
    request: GeminiGenerationRequest,
  ): Promise<GeminiGenerationResult> {
    const apiKey = this.config.get<string>('GLOWNSCAN_GEMINI_API_KEY');
    if (!apiKey?.trim()) {
      throw new Error('GLOWNSCAN_GEMINI_API_KEY is required for Gemini calls.');
    }

    const model = this.config.get<string>(
      'GLOWNSCAN_GEMINI_MODEL',
      'gemini-2.5-flash',
    );
    const baseUrl =
      this.config
        .get<string>('GLOWNSCAN_GEMINI_BASE_URL')
        ?.trim()
        .replace(/\/+$/, '') || DEFAULT_GEMINI_API_BASE_URL;
    const timeoutMs = this.positiveInt(
      'GLOWNSCAN_GEMINI_TIMEOUT_MS',
      DEFAULT_GEMINI_REQUEST_TIMEOUT_MS,
    );
    const attempts = this.positiveInt('GLOWNSCAN_GEMINI_MAX_ATTEMPTS', 3);
    let lastError: unknown;
    for (let attempt = 0; attempt < attempts; attempt += 1) {
      try {
        return await this.requestOnce(
          request,
          apiKey,
          model,
          baseUrl,
          timeoutMs,
        );
      } catch (error) {
        lastError = error;
        if (
          !(error instanceof GeminiRequestError) ||
          !error.retryable ||
          attempt === attempts - 1
        )
          throw error;
        await new Promise((resolve) =>
          setTimeout(
            resolve,
            Math.min(5_000, 200 * 2 ** attempt) +
              Math.floor(Math.random() * 100),
          ),
        );
      }
    }
    throw lastError;
  }

  private async requestOnce(
    request: GeminiGenerationRequest,
    apiKey: string,
    model: string,
    baseUrl: string,
    timeoutMs: number,
  ): Promise<GeminiGenerationResult> {
    let response: Response;
    try {
      response = await fetch(
        `${baseUrl}/${encodeURIComponent(model)}:generateContent`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-goog-api-key': apiKey,
          },
          signal: AbortSignal.timeout(timeoutMs),
          body: JSON.stringify({
            contents: [
              {
                role: 'user',
                parts: [
                  { text: request.prompt },
                  {
                    inlineData: {
                      mimeType: request.image.mimeType,
                      data: Buffer.from(request.image.data).toString('base64'),
                    },
                  },
                ],
              },
            ],
            generationConfig: { responseMimeType: 'application/json' },
          }),
        },
      );
    } catch (error) {
      throw new GeminiRequestError(
        'GEMINI_NETWORK_OR_TIMEOUT',
        true,
        'Gemini request timed out or could not reach the provider.',
      );
    }

    if (!response.ok) {
      const retryAfter = Number(response.headers.get('retry-after'));
      if (response.status === 429 || response.status >= 500) {
        if (Number.isFinite(retryAfter) && retryAfter > 0)
          await new Promise((resolve) =>
            setTimeout(resolve, retryAfter * 1000),
          );
        throw new GeminiRequestError(
          `GEMINI_HTTP_${response.status}`,
          true,
          `Gemini API request failed with HTTP ${response.status}.`,
        );
      }
      throw new GeminiRequestError(
        `GEMINI_HTTP_${response.status}`,
        false,
        `Gemini API request failed with HTTP ${response.status}.`,
      );
    }

    const payload: unknown = await response.json();
    return this.toGenerationResult(payload, model);
  }

  private positiveInt(key: string, fallback: number): number {
    const value = Number(this.config.get<string>(key, String(fallback)));
    if (!Number.isInteger(value) || value < 1)
      throw new Error(`${key} must be a positive integer.`);
    return value;
  }

  private toGenerationResult(
    payload: unknown,
    requestedModel: string,
  ): GeminiGenerationResult {
    if (payload === null || typeof payload !== 'object') {
      throw new Error('Gemini API returned an invalid response.');
    }

    if (!isRecord(payload)) {
      throw new Error('Gemini API returned an invalid response.');
    }

    const candidates = Array.isArray(payload.candidates)
      ? payload.candidates
      : [];
    const candidate = candidates[0];
    if (!isRecord(candidate)) {
      throw new Error('Gemini API response did not contain a candidate.');
    }
    const content = isRecord(candidate.content) ? candidate.content : {};
    const parts = Array.isArray(content.parts) ? content.parts : [];
    const text = parts
      .map((part) => (isRecord(part) ? part.text : undefined))
      .filter((part): part is string => typeof part === 'string')
      .join('');
    if (!text) {
      throw new Error('Gemini API response did not contain generated text.');
    }

    return {
      text,
      model:
        typeof payload.modelVersion === 'string'
          ? payload.modelVersion
          : requestedModel,
      finishReason:
        typeof candidate.finishReason === 'string'
          ? candidate.finishReason
          : null,
    };
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}
