import { ConfigService } from '@nestjs/config';
import { Logger } from '@nestjs/common';
import { GeminiGenerativeModelAdapter } from '../src/modules/skin-analysis/infrastructure/adapters/gemini-generative-model.adapter.js';

describe('GeminiGenerativeModelAdapter', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('sends the prompt and inline image and returns generated text', async () => {
    const fetch = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(
        JSON.stringify({
          modelVersion: 'gemini-test',
          candidates: [
            {
              content: { parts: [{ text: '{"quality":{"accepted":true}}' }] },
              finishReason: 'STOP',
            },
          ],
        }),
        { status: 200 },
      ),
    );
    const config = new ConfigService({
      GLOWNSCAN_GEMINI_API_KEY: 'test-key',
      GLOWNSCAN_GEMINI_MODEL: 'gemini-test-model',
    });
    const adapter = new GeminiGenerativeModelAdapter(config);

    await expect(
      adapter.generateContent({
        prompt: 'Analyze this image.',
        image: { mimeType: 'image/jpeg', data: Buffer.from('image-data') },
      }),
    ).resolves.toEqual({
      text: '{"quality":{"accepted":true}}',
      model: 'gemini-test',
      finishReason: 'STOP',
    });

    const [url, options] = fetch.mock.calls[0]!;
    expect(url).toBe(
      'https://generativelanguage.googleapis.com/v1beta/models/gemini-test-model:generateContent',
    );
    expect(options?.headers).toMatchObject({
      'x-goog-api-key': 'test-key',
    });
    if (typeof options?.body !== 'string') {
      throw new Error('Expected Gemini request body to be a JSON string.');
    }
    expect(JSON.parse(options.body)).toEqual({
      contents: [
        {
          role: 'user',
          parts: [
            { text: 'Analyze this image.' },
            {
              inlineData: {
                mimeType: 'image/jpeg',
                data: Buffer.from('image-data').toString('base64'),
              },
            },
          ],
        },
      ],
      generationConfig: { responseMimeType: 'application/json' },
    });
  });

  it('fails explicitly when the API key is missing', async () => {
    const config = {
      get: vi.fn().mockReturnValue(undefined),
    } as unknown as ConfigService;
    const adapter = new GeminiGenerativeModelAdapter(config);

    await expect(
      adapter.generateContent({
        prompt: 'Analyze this image.',
        image: { mimeType: 'image/jpeg', data: Buffer.from('image-data') },
      }),
    ).rejects.toThrow('GLOWNSCAN_GEMINI_API_KEY is required for Gemini calls.');
  });

  it('uses the configured API base URL', async () => {
    const fetch = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(
        JSON.stringify({
          candidates: [{ content: { parts: [{ text: '{"ok":true}' }] } }],
        }),
        { status: 200 },
      ),
    );
    const adapter = new GeminiGenerativeModelAdapter(
      new ConfigService({
        GLOWNSCAN_GEMINI_API_KEY: 'test-key',
        GLOWNSCAN_GEMINI_BASE_URL: 'https://gemini-proxy.example/v1/models/',
        GLOWNSCAN_GEMINI_MODEL: 'gemini-test',
      }),
    );

    await adapter.generateContent({
      prompt: 'Analyze this image.',
      image: { mimeType: 'image/jpeg', data: Buffer.from('image-data') },
    });

    expect(fetch.mock.calls[0]?.[0]).toBe(
      'https://gemini-proxy.example/v1/models/gemini-test:generateContent',
    );
  });

  it('defaults Gemini requests to a 2-minute timeout', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(
        JSON.stringify({
          candidates: [{ content: { parts: [{ text: '{"ok":true}' }] } }],
        }),
        { status: 200 },
      ),
    );
    const timeout = vi.spyOn(AbortSignal, 'timeout');
    const adapter = new GeminiGenerativeModelAdapter(
      new ConfigService({ GLOWNSCAN_GEMINI_API_KEY: 'test-key' }),
    );

    await adapter.generateContent({
      prompt: 'Analyze.',
      image: { mimeType: 'image/jpeg', data: Buffer.from('image') },
    });

    expect(timeout).toHaveBeenCalledWith(120_000);
  });

  it('logs and rejects a successful HTTP response with invalid JSON', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response('{not-json', { status: 200 }),
    );
    const loggerError = vi
      .spyOn(Logger.prototype, 'error')
      .mockImplementation(() => {});
    const adapter = new GeminiGenerativeModelAdapter(
      new ConfigService({ GLOWNSCAN_GEMINI_API_KEY: 'test-key' }),
    );

    await expect(
      adapter.generateContent({
        prompt: 'Analyze.',
        image: { mimeType: 'image/jpeg', data: Buffer.from('image') },
      }),
    ).rejects.toThrow('Gemini API returned invalid JSON.');
    expect(loggerError.mock.calls[0]?.[0]).toContain('"stage":"json_decode"');
  });

  it('logs provider response metadata when Gemini returns an invalid shape', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(
        JSON.stringify({ promptFeedback: { blockReason: 'SAFETY' } }),
        {
          status: 200,
        },
      ),
    );
    const loggerError = vi
      .spyOn(Logger.prototype, 'error')
      .mockImplementation(() => {});
    const adapter = new GeminiGenerativeModelAdapter(
      new ConfigService({ GLOWNSCAN_GEMINI_API_KEY: 'test-key' }),
    );

    await expect(
      adapter.generateContent({
        prompt: 'Analyze.',
        image: { mimeType: 'image/jpeg', data: Buffer.from('image') },
      }),
    ).rejects.toThrow('Gemini API response did not contain a candidate.');
    expect(loggerError.mock.calls[0]?.[0]).toContain('SAFETY');
    expect(loggerError.mock.calls[0]?.[0]).toContain('response_validation');
  });

  it('logs network failures without exposing request credentials', async () => {
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(
      new Error('socket failed for https://private.example/?api_key=secret'),
    );
    const loggerError = vi
      .spyOn(Logger.prototype, 'error')
      .mockImplementation(() => {});
    const adapter = new GeminiGenerativeModelAdapter(
      new ConfigService({ GLOWNSCAN_GEMINI_API_KEY: 'test-key' }),
    );

    await expect(
      adapter.generateContent({
        prompt: 'Analyze.',
        image: { mimeType: 'image/jpeg', data: Buffer.from('image') },
      }),
    ).rejects.toThrow(
      'Gemini request timed out or could not reach the provider.',
    );
    expect(loggerError.mock.calls[0]?.[0]).toContain(
      'GEMINI_NETWORK_OR_TIMEOUT',
    );
    expect(loggerError.mock.calls[0]?.[0]).not.toContain('private.example');
    expect(loggerError.mock.calls[0]?.[0]).not.toContain('secret');
  });

  it('fails explicitly when Gemini returns an unsuccessful status', async () => {
    const fakeGoogleApiKey = ['AIza', '123456789012345678901234'].join('');
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(
        JSON.stringify({
          error: {
            status: 'RESOURCE_EXHAUSTED',
            message: `Quota exceeded for key: ${fakeGoogleApiKey}`,
          },
        }),
        { status: 429 },
      ),
    );
    const loggerError = vi
      .spyOn(Logger.prototype, 'error')
      .mockImplementation(() => {});
    const adapter = new GeminiGenerativeModelAdapter(
      new ConfigService({ GLOWNSCAN_GEMINI_API_KEY: 'test-key' }),
    );

    await expect(
      adapter.generateContent({
        prompt: 'Analyze this image.',
        image: { mimeType: 'image/jpeg', data: Buffer.from('image-data') },
      }),
    ).rejects.toThrow('Gemini API request failed with HTTP 429.');

    const log = loggerError.mock.calls[0]?.[0] as string;
    expect(log).toContain('RESOURCE_EXHAUSTED');
    expect(log).toContain('Quota exceeded');
    expect(log).not.toContain(fakeGoogleApiKey);
    expect(log).toContain('"retryable":true');
  });
});
