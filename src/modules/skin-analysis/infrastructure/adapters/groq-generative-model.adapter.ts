import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type {
  GenerationRequest,
  GenerationResult,
  GenerativeModelPort,
} from '../../application/ports/generative-model.port.js';
import { AnalysisProvider } from '../../domain/entities/enums/skin-analysis.enums.js';

const DEFAULT_GROQ_API_URL = 'https://api.groq.com/openai/v1/chat/completions';
const DEFAULT_GROQ_MODEL = 'qwen/qwen3.8-27b';
const DEFAULT_GROQ_REQUEST_TIMEOUT_MS = 120_000;

export class GroqRequestError extends Error {
  constructor(
    readonly code: string,
    readonly retryable: boolean,
    message: string,
  ) {
    super(message);
    this.name = 'GroqRequestError';
  }
}

@Injectable()
export class GroqGenerativeModelAdapter implements GenerativeModelPort {
  readonly provider = AnalysisProvider.Groq;
  private readonly logger = new Logger(GroqGenerativeModelAdapter.name);

  constructor(private readonly config: ConfigService) {}

  async generateContent(request: GenerationRequest): Promise<GenerationResult> {
    const apiKey = this.config.get<string>('GLOWNSCAN_GROQ_API_KEY');
    if (!apiKey?.trim())
      throw new Error('GLOWNSCAN_GROQ_API_KEY is required for Groq calls.');

    const model = this.config.get<string>(
      'GLOWNSCAN_GROQ_MODEL',
      DEFAULT_GROQ_MODEL,
    );
    const apiUrl =
      this.config
        .get<string>('GLOWNSCAN_GROQ_BASE_URL')
        ?.trim()
        .replace(/\/+$/, '') || DEFAULT_GROQ_API_URL;
    const timeoutMs = positiveInt(
      this.config.get<string>(
        'GLOWNSCAN_GROQ_TIMEOUT_MS',
        String(DEFAULT_GROQ_REQUEST_TIMEOUT_MS),
      ),
      'GLOWNSCAN_GROQ_TIMEOUT_MS',
    );

    // BullMQ owns retries: one worker attempt must produce one provider call.
    const startedAt = Date.now();
    let response: Response;
    try {
      response = await fetch(apiUrl, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        signal: AbortSignal.timeout(timeoutMs),
        body: JSON.stringify({
          model,
          messages: [
            {
              role: 'user',
              content: [
                { type: 'text', text: request.prompt },
                {
                  type: 'image_url',
                  image_url: {
                    url: `data:${request.image.mimeType};base64,${Buffer.from(request.image.data).toString('base64')}`,
                  },
                },
              ],
            },
          ],
          response_format: { type: 'json_object' },
          stream: false,
        }),
      });
    } catch (error) {
      this.logger.error(
        JSON.stringify({
          event: 'groq_request_failed',
          stage: 'http_request',
          errorCode: 'GROQ_NETWORK_OR_TIMEOUT',
          model,
          durationMs: Date.now() - startedAt,
          errorName: error instanceof Error ? error.name : 'UNKNOWN',
          errorMessage: safeErrorMessage(error),
        }),
      );
      throw new GroqRequestError(
        'GROQ_NETWORK_OR_TIMEOUT',
        true,
        'Groq request timed out or could not reach the provider.',
      );
    }

    if (!response.ok) {
      const responseBody = await response.text().catch(() => '');
      const providerError = summarizeProviderError(responseBody);
      const retryable = isRetryable(response.status, providerError);
      this.logger.error(
        JSON.stringify({
          event: 'groq_request_failed',
          stage: 'provider_response',
          model,
          httpStatus: response.status,
          durationMs: Date.now() - startedAt,
          retryable,
          providerError,
        }),
      );
      throw new GroqRequestError(
        `GROQ_HTTP_${response.status}`,
        retryable,
        `Groq API request failed with HTTP ${response.status}.`,
      );
    }

    let payload: unknown;
    try {
      payload = await response.json();
    } catch {
      throw new Error('Groq API returned invalid JSON.');
    }
    if (!isRecord(payload))
      throw new Error('Groq API returned an invalid response.');
    const generatedText = extractMessageText(payload);
    if (!generatedText)
      throw new Error('Groq API response did not contain generated text.');

    const result: GenerationResult = {
      text: generatedText,
      model: readString(payload, 'model') ?? model,
      finishReason: readFirstChoiceString(payload, 'finish_reason'),
    };
    this.logger.log(
      JSON.stringify({
        event: 'groq_response_received',
        requestedModel: model,
        responseModel: result.model,
        finishReason: result.finishReason,
        generatedTextLength: result.text.length,
        durationMs: Date.now() - startedAt,
      }),
    );
    return result;
  }
}

function extractMessageText(payload: unknown): string | null {
  if (!isRecord(payload) || !Array.isArray(payload.choices)) return null;
  const firstChoice = payload.choices[0];
  if (!isRecord(firstChoice) || !isRecord(firstChoice.message)) return null;
  const content = firstChoice.message.content;
  if (typeof content === 'string' && content.length > 0) return content;
  if (!Array.isArray(content)) return null;
  const text = content
    .filter(
      (part): part is Record<string, unknown> =>
        isRecord(part) && typeof part.text === 'string',
    )
    .map((part) => part.text as string)
    .join('');
  return text || null;
}

function readFirstChoiceString(payload: unknown, key: string): string | null {
  if (!isRecord(payload) || !Array.isArray(payload.choices)) return null;
  const firstChoice = payload.choices[0];
  return isRecord(firstChoice) && typeof firstChoice[key] === 'string'
    ? firstChoice[key]
    : null;
}

function readString(
  value: Record<string, unknown>,
  key: string,
): string | null {
  return typeof value[key] === 'string' ? value[key] : null;
}

function positiveInt(value: string, key: string): number {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 1)
    throw new Error(`${key} must be a positive integer.`);
  return parsed;
}

function isRetryable(
  status: number,
  providerError: Record<string, string> | null,
): boolean {
  const code = providerError?.code?.toLowerCase();
  const type = providerError?.type?.toLowerCase();
  const message = providerError?.message?.toLowerCase();
  if (
    code?.includes('insufficient_quota') ||
    code?.includes('credit_balance') ||
    type?.includes('insufficient_quota') ||
    message?.includes('insufficient_quota') ||
    message?.includes('credit balance')
  )
    return false;
  return status === 429 || status >= 500;
}

function summarizeProviderError(body: string): Record<string, string> | null {
  if (!body) return null;
  try {
    const parsed: unknown = JSON.parse(body);
    if (!isRecord(parsed) || !isRecord(parsed.error)) return null;
    return {
      ...(typeof parsed.error.type === 'string'
        ? { type: parsed.error.type }
        : {}),
      ...(typeof parsed.error.code === 'string'
        ? { code: parsed.error.code }
        : {}),
      ...(typeof parsed.error.message === 'string'
        ? { message: redact(parsed.error.message).slice(0, 500) }
        : {}),
    };
  } catch {
    return { message: redact(body).slice(0, 500) };
  }
}

function safeErrorMessage(error: unknown): string {
  if (!(error instanceof Error)) return 'Unknown error';
  return redact(error.message).slice(0, 500);
}

function redact(value: string): string {
  return value
    .replace(/https?:\/\/[^\s"'<>]+/gi, '[REDACTED_URL]')
    .replace(/\bBearer\s+[^\s"']+/gi, 'Bearer [REDACTED]')
    .replace(/\b(gsk_[A-Za-z0-9_-]{8,})\b/g, '[REDACTED_API_KEY]');
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}
