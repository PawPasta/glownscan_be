import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type {
  GeminiGenerationRequest,
  GeminiGenerationResult,
  GeminiGenerativeModelPort,
} from '../../application/ports/gemini-generative-model.port.js';

const GEMINI_API_BASE_URL =
  'https://generativelanguage.googleapis.com/v1beta/models';
const GEMINI_REQUEST_TIMEOUT_MS = 60_000;

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
    const response = await fetch(
      `${GEMINI_API_BASE_URL}/${encodeURIComponent(model)}:generateContent`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-goog-api-key': apiKey,
        },
        signal: AbortSignal.timeout(GEMINI_REQUEST_TIMEOUT_MS),
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

    if (!response.ok) {
      throw new Error(
        `Gemini API request failed with HTTP ${response.status}.`,
      );
    }

    const payload: unknown = await response.json();
    return this.toGenerationResult(payload, model);
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
