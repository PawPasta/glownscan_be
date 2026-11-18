import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { UnprocessableEntityException } from '../../../../shared/handler/http.exceptions.js';
import type { AnalysisImageInput } from '../../application/ports/generative-model.port.js';
import type { ImageDownloaderPort } from '../../application/ports/image-downloader.port.js';

const ALLOWED_IMAGE_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);

@Injectable()
export class CloudinaryImageDownloader implements ImageDownloaderPort {
  private readonly maxBytes: number;
  private readonly timeoutMs: number;

  constructor(config: ConfigService) {
    this.maxBytes = positiveInteger(
      config.get<string>('GLOWNSCAN_ANALYSIS_IMAGE_MAX_BYTES', '10485760'),
      'GLOWNSCAN_ANALYSIS_IMAGE_MAX_BYTES',
    );
    this.timeoutMs = positiveInteger(
      config.get<string>(
        'GLOWNSCAN_ANALYSIS_IMAGE_DOWNLOAD_TIMEOUT_MS',
        '30000',
      ),
      'GLOWNSCAN_ANALYSIS_IMAGE_DOWNLOAD_TIMEOUT_MS',
    );
  }

  async download(secureUrl: string): Promise<AnalysisImageInput> {
    const response = await fetch(secureUrl, {
      method: 'GET',
      redirect: 'error',
      signal: AbortSignal.timeout(this.timeoutMs),
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
    if (Number.isFinite(contentLength) && contentLength > this.maxBytes) {
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
      if (done) break;
      totalBytes += value.byteLength;
      if (totalBytes > this.maxBytes) {
        await reader.cancel();
        throw new UnprocessableEntityException(
          'The image must be 10 MB or smaller.',
        );
      }
      chunks.push(value);
    }
    if (totalBytes === 0) {
      throw new UnprocessableEntityException(
        'Cloudinary returned an empty image.',
      );
    }
    const data = new Uint8Array(totalBytes);
    let offset = 0;
    for (const chunk of chunks) {
      data.set(chunk, offset);
      offset += chunk.byteLength;
    }
    return { mimeType, data };
  }
}

function positiveInteger(value: string, key: string): number {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 1) {
    throw new Error(`${key} must be a positive integer.`);
  }
  return parsed;
}
