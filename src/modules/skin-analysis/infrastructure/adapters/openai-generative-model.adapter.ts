import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type {
  GenerationRequest,
  GenerationResult,
  GenerativeModelPort,
} from '../../application/ports/generative-model.port.js';
import { AnalysisProvider } from '../../domain/entities/enums/skin-analysis.enums.js';

const DEFAULT_OPENAI_API_URL = 'https://api.openai.com/v1/responses';
const DEFAULT_OPENAI_MODEL = 'gpt-5.6-luna';
const DEFAULT_OPENAI_REQUEST_TIMEOUT_MS = 120_000;

export class OpenAIRequestError extends Error {
  constructor(
    readonly code: string,
    readonly retryable: boolean,
    message: string,
  ) {
    super(message);
    this.name = 'OpenAIRequestError';
  }
}

@Injectable()
export class OpenAiGenerativeModelAdapter implements GenerativeModelPort {
  readonly provider = AnalysisProvider.OpenAI;
  private readonly logger = new Logger(OpenAiGenerativeModelAdapter.name);

  constructor(private readonly config: ConfigService) {}

  async generateContent(request: GenerationRequest): Promise<GenerationResult> {
    const apiKey = this.config.get<string>('GLOWNSCAN_OPENAI_API_KEY');
    if (!apiKey?.trim())
      throw new Error('GLOWNSCAN_OPENAI_API_KEY is required for OpenAI calls.');

    const model = this.config.get<string>(
      'GLOWNSCAN_OPENAI_MODEL',
      DEFAULT_OPENAI_MODEL,
    );
    const apiUrl =
      this.config
        .get<string>('GLOWNSCAN_OPENAI_BASE_URL')
        ?.trim()
        .replace(/\/+$/, '') || DEFAULT_OPENAI_API_URL;
    const timeoutMs = positiveInt(
      this.config.get<string>(
        'GLOWNSCAN_OPENAI_TIMEOUT_MS',
        String(DEFAULT_OPENAI_REQUEST_TIMEOUT_MS),
      ),
      'GLOWNSCAN_OPENAI_TIMEOUT_MS',
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
          input: [
            {
              role: 'user',
              content: [
                { type: 'input_text', text: request.prompt },
                {
                  type: 'input_image',
                  image_url: `data:${request.image.mimeType};base64,${Buffer.from(request.image.data).toString('base64')}`,
                  detail: 'high',
                },
              ],
            },
          ],
          text: { format: { type: 'json_object' } },
        }),
      });
    } catch (error) {
      this.logger.error(
        JSON.stringify({
          event: 'openai_request_failed',
          stage: 'http_request',
          errorCode: 'OPENAI_NETWORK_OR_TIMEOUT',
          model,
          durationMs: Date.now() - startedAt,
          errorName: error instanceof Error ? error.name : 'UNKNOWN',
          errorMessage: safeErrorMessage(error),
        }),
      );
      throw new OpenAIRequestError(
        'OPENAI_NETWORK_OR_TIMEOUT',
        true,
        'OpenAI request timed out or could not reach the provider.',
      );
    }

    if (!response.ok) {
      const responseBody = await response.text().catch(() => '');
      const retryable = response.status === 429 || response.status >= 500;
      this.logger.error(
        JSON.stringify({
          event: 'openai_request_failed',
          stage: 'provider_response',
          model,
          httpStatus: response.status,
          durationMs: Date.now() - startedAt,
          retryable,
          providerError: summarizeProviderError(responseBody),
        }),
      );
      throw new OpenAIRequestError(
        `OPENAI_HTTP_${response.status}`,
        retryable,
        `OpenAI API request failed with HTTP ${response.status}.`,
      );
    }

    let payload: unknown;
    try {
      payload = await response.json();
    } catch {
      throw new Error('OpenAI API returned invalid JSON.');
    }
    if (!isRecord(payload))
      throw new Error('OpenAI API returned an invalid response.');
    const generatedText = extractOutputText(payload);
    if (!generatedText)
      throw new Error('OpenAI API response did not contain generated text.');

    const result: GenerationResult = {
      text: generatedText,
      model: readString(payload, 'model') ?? model,
      finishReason: readString(payload, 'status'),
    };
    this.logger.log(
      JSON.stringify({
        event: 'openai_response_received',
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

function extractOutputText(payload: unknown): string | null {
  if (!isRecord(payload)) return null;
  if (typeof payload.output_text === 'string' && payload.output_text)
    return payload.output_text;
  if (!Array.isArray(payload.output)) return null;
  const texts: string[] = [];
  for (const item of payload.output) {
    if (!isRecord(item) || !Array.isArray(item.content)) continue;
    for (const content of item.content) {
      if (
        isRecord(content) &&
        content.type === 'output_text' &&
        typeof content.text === 'string'
      )
        texts.push(content.text);
    }
  }
  return texts.join('') || null;
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
    .replace(/\b(sk-[A-Za-z0-9_-]{8,})\b/g, '[REDACTED_API_KEY]');
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}
