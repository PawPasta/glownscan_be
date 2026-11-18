import type { AnalysisProvider } from '../../domain/entities/enums/skin-analysis.enums.js';

export interface AnalysisImageInput {
  mimeType: string;
  data: Uint8Array;
}

export interface GenerationRequest {
  prompt: string;
  image: AnalysisImageInput;
}

export interface GenerationResult {
  text: string;
  model: string;
  finishReason: string | null;
}

export interface GenerativeModelPort {
  readonly provider: AnalysisProvider;
  generateContent(request: GenerationRequest): Promise<GenerationResult>;
}

export const GENERATIVE_MODEL_PORT = Symbol('GENERATIVE_MODEL_PORT');
