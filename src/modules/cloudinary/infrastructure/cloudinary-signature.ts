import { createHash, timingSafeEqual } from 'node:crypto';

type CloudinaryParams = Record<string, string | number>;

export function signCloudinaryParams(
  params: CloudinaryParams,
  apiSecret: string,
): string {
  const payload = Object.keys(params)
    .sort()
    .map((key) => `${key}=${params[key]}`)
    .join('&');
  return createHash('sha1').update(`${payload}${apiSecret}`).digest('hex');
}

export function verifyCloudinarySignature(
  params: CloudinaryParams,
  signature: string,
  apiSecret: string,
): boolean {
  if (!/^[a-f0-9]{40}$/i.test(signature)) {
    return false;
  }
  const expected = Buffer.from(signCloudinaryParams(params, apiSecret), 'hex');
  const received = Buffer.from(signature, 'hex');
  return timingSafeEqual(expected, received);
}

export function isExpectedCloudinaryUrl(
  secureUrl: string,
  cloudName: string,
  publicId: string,
  version: number,
): boolean {
  try {
    const url = new URL(secureUrl);
    const expectedPath = `/${cloudName}/image/upload/v${version}/${publicId}`;
    return (
      url.protocol === 'https:' &&
      url.hostname === 'res.cloudinary.com' &&
      !url.port &&
      !url.username &&
      !url.password &&
      !url.search &&
      !url.hash &&
      (url.pathname === expectedPath ||
        new RegExp(`^${escapeRegExp(expectedPath)}\\.[a-zA-Z0-9]+$`).test(
          url.pathname,
        ))
    );
  } catch {
    return false;
  }
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
