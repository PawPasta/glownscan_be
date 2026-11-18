import type { AnalysisImageInput } from './generative-model.port.js';

/** Downloads an already-authorized analysis image for a provider request. */
export interface ImageDownloaderPort {
  download(secureUrl: string): Promise<AnalysisImageInput>;
}

export const IMAGE_DOWNLOADER_PORT = Symbol('IMAGE_DOWNLOADER_PORT');
