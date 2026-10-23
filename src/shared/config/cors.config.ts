import type { INestApplication } from '@nestjs/common';


//URL default để chạy local, nếu muốn chạy trên server thì cần set biến môi trường GLOWNSCAN_FRONTEND_URL
const defaultFrontendOrigin = 'http://localhost:5173';

export function getCorsOptions(
  frontendUrl = process.env.GLOWNSCAN_FRONTEND_URL,
) {
  const origins = (frontendUrl ?? defaultFrontendOrigin)
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);

  if (origins.includes('*')) {
    throw new Error(
      'GLOWNSCAN_FRONTEND_URL must list explicit origins; wildcard origins are not allowed.',
    );
  }

  return {
    origin: origins,
    credentials: true,
  };
}

export function setupCors(app: INestApplication): void {
  app.enableCors(getCorsOptions());
}
