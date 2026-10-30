import { ConfigService } from '@nestjs/config';
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
    const adapter = new GeminiGenerativeModelAdapter(new ConfigService({}));

    await expect(
      adapter.generateContent({
        prompt: 'Analyze this image.',
        image: { mimeType: 'image/jpeg', data: Buffer.from('image-data') },
      }),
    ).rejects.toThrow('GLOWNSCAN_GEMINI_API_KEY is required for Gemini calls.');
  });

  it('fails explicitly when Gemini returns an unsuccessful status', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(null, { status: 429 }),
    );
    const adapter = new GeminiGenerativeModelAdapter(
      new ConfigService({ GLOWNSCAN_GEMINI_API_KEY: 'test-key' }),
    );

    await expect(
      adapter.generateContent({
        prompt: 'Analyze this image.',
        image: { mimeType: 'image/jpeg', data: Buffer.from('image-data') },
      }),
    ).rejects.toThrow('Gemini API request failed with HTTP 429.');
  });
});
