import type { GeminiImageInput } from './gemini-generative-model.port.js';

/** Downloads an already-authorized analysis image for a provider request. */
export interface ImageDownloaderPort {
  download(secureUrl: string): Promise<GeminiImageInput>;
}

export const IMAGE_DOWNLOADER_PORT = Symbol('IMAGE_DOWNLOADER_PORT');
