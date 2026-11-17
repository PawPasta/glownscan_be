import { Injectable, Logger } from '@nestjs/common';
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
  private readonly logger = new Logger(GeminiGenerativeModelAdapter.name);

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
    // BullMQ owns retries: one worker attempt must produce one provider call.
    const attempts = 1;
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
    const startedAt = Date.now();
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
      this.logger.error(
        JSON.stringify({
          event: 'gemini_request_failed',
          stage: 'http_request',
          errorCode: 'GEMINI_NETWORK_OR_TIMEOUT',
          model,
          durationMs: Date.now() - startedAt,
          errorName: error instanceof Error ? error.name : 'UNKNOWN',
          errorMessage: safeErrorMessage(error),
        }),
      );
      throw new GeminiRequestError(
        'GEMINI_NETWORK_OR_TIMEOUT',
        true,
        'Gemini request timed out or could not reach the provider.',
      );
    }

    if (!response.ok) {
      const responseBody = await response.text().catch(() => '');
      this.logger.error(
        JSON.stringify({
          event: 'gemini_request_failed',
          stage: 'provider_response',
          model,
          httpStatus: response.status,
          durationMs: Date.now() - startedAt,
          retryable: response.status === 429 || response.status >= 500,
          providerError: summarizeProviderError(responseBody),
        }),
      );
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

    let payload: unknown;
    try {
      payload = await response.json();
    } catch (error) {
      this.logger.error(
        JSON.stringify({
          event: 'gemini_response_failed',
          stage: 'json_decode',
          model,
          httpStatus: response.status,
          durationMs: Date.now() - startedAt,
          errorMessage: safeErrorMessage(error),
        }),
      );
      throw new Error('Gemini API returned invalid JSON.');
    }
    try {
      const result = this.toGenerationResult(payload, model);
      this.logger.log(
        JSON.stringify({
          event: 'gemini_response_received',
          httpStatus: response.status,
          requestedModel: model,
          responseModel: result.model,
          finishReason: result.finishReason,
          generatedTextLength: result.text.length,
          durationMs: Date.now() - startedAt,
        }),
      );
      return result;
    } catch (error) {
      this.logger.error(
        JSON.stringify({
          event: 'gemini_response_failed',
          stage: 'response_validation',
          httpStatus: response.status,
          model,
          durationMs: Date.now() - startedAt,
          errorMessage: safeErrorMessage(error),
          ...summarizePayload(payload),
        }),
      );
      throw error;
    }
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

function summarizeProviderError(body: string): Record<string, string> | null {
  if (!body) return null;
  try {
    const parsed: unknown = JSON.parse(body);
    if (!isRecord(parsed) || !isRecord(parsed.error)) return null;
    return {
      ...(typeof parsed.error.status === 'string'
        ? { status: parsed.error.status }
        : {}),
      ...(typeof parsed.error.message === 'string'
        ? { message: redact(parsed.error.message).slice(0, 500) }
        : {}),
    };
  } catch {
    return { message: redact(body).slice(0, 500) };
  }
}

function summarizePayload(payload: unknown): Record<string, unknown> {
  if (!isRecord(payload)) return { responseShape: typeof payload };
  const candidates = Array.isArray(payload.candidates)
    ? payload.candidates
    : [];
  const candidate = candidates[0];
  const finishReason = isRecord(candidate) ? candidate.finishReason : undefined;
  const promptFeedback = isRecord(payload.promptFeedback)
    ? payload.promptFeedback
    : undefined;
  return {
    candidateCount: candidates.length,
    ...(typeof finishReason === 'string' ? { finishReason } : {}),
    ...(typeof promptFeedback?.blockReason === 'string'
      ? { blockReason: promptFeedback.blockReason }
      : {}),
  };
}

function safeErrorMessage(error: unknown): string {
  if (!(error instanceof Error)) return 'Unknown error';
  return redact(error.message).slice(0, 500);
}

function redact(value: string): string {
  return value
    .replace(/\bAIza[\w-]{20,}\b/g, '[REDACTED_API_KEY]')
    .replace(/\b([\w-]+)\s*:\s*["']?[^\s,"'}]+/gi, (match, key: string) =>
      /key|token|secret|credential|authorization/i.test(key)
        ? `${key}: [REDACTED]`
        : match,
    )
    .replace(/https?:\/\/[^\s"'<>]+/gi, '[REDACTED_URL]');
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}
