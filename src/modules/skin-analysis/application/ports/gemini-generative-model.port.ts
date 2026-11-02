export interface GeminiImageInput {
  mimeType: string;
  data: Uint8Array;
}

export interface GeminiGenerationRequest {
  prompt: string;
  image: GeminiImageInput;
}

export interface GeminiGenerationResult {
  text: string;
  model: string;
  finishReason: string | null;
}

export interface GeminiGenerativeModelPort {
  generateContent(
    request: GeminiGenerationRequest,
  ): Promise<GeminiGenerationResult>;
}

export const GEMINI_GENERATIVE_MODEL_PORT = Symbol(
  'GEMINI_GENERATIVE_MODEL_PORT',
);
