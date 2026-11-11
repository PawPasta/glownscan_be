import { ConfigService } from '@nestjs/config';
import { describe, expect, it, vi } from 'vitest';
import { CloudinaryImageDownloader } from '../src/modules/skin-analysis/infrastructure/adapters/cloudinary-image-downloader.js';
import { UnprocessableEntityException } from '../src/shared/handler/http.exceptions.js';

const config = {
  get: (_key: string, fallback: string) => fallback,
} as unknown as ConfigService;

describe('CloudinaryImageDownloader', () => {
  it('rejects an image with an unsupported MIME type before provider use', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response('not an image', {
        headers: { 'content-type': 'text/html' },
      }),
    );
    const downloader = new CloudinaryImageDownloader(config);

    await expect(
      downloader.download('https://example.test/image'),
    ).rejects.toBeInstanceOf(UnprocessableEntityException);
  });

  it('returns bounded image bytes and MIME type', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(Buffer.from([1, 2, 3]), {
        headers: { 'content-type': 'image/jpeg', 'content-length': '3' },
      }),
    );
    const downloader = new CloudinaryImageDownloader(config);

    await expect(
      downloader.download('https://example.test/image'),
    ).resolves.toEqual({
      mimeType: 'image/jpeg',
      data: new Uint8Array([1, 2, 3]),
    });
  });
});
