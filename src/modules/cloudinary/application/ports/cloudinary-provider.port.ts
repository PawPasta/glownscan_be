export const CLOUDINARY_PROVIDER_PORT = Symbol('CLOUDINARY_PROVIDER_PORT');

export interface CloudinaryUploadCredentials {
  cloudName: string;
  apiKey: string;
  apiSecret: string;
}

export interface CloudinaryProviderPort {
  getUploadCredentials(): CloudinaryUploadCredentials;
  sign(params: Record<string, string | number>, apiSecret: string): string;
  verify(
    params: Record<string, string | number>,
    signature: string,
    apiSecret: string,
  ): boolean;
  isExpectedImageUrl(
    secureUrl: string,
    cloudName: string,
    publicId: string,
    version: number,
  ): boolean;
}
