export function validateEnvironment(env: Record<string, unknown>) {
  const required = [
    'GLOWNSCAN_DATABASE_URL',
    'GLOWNSCAN_JWT_ACCESS_SECRET',
    'GLOWNSCAN_SMTP_HOST',
    'GLOWNSCAN_SMTP_USER',
    'GLOWNSCAN_SMTP_PASSWORD',
    'GLOWNSCAN_FRONTEND_URL',
    'GLOWNSCAN_FIREBASE_PROJECT_ID',
    'GLOWNSCAN_CLOUDINARY_CLOUD_NAME',
    'GLOWNSCAN_CLOUDINARY_API_KEY',
    'GLOWNSCAN_CLOUDINARY_API_SECRET',
    'GLOWNSCAN_GEMINI_API_KEY',
    'GLOWNSCAN_SEPAY_WEBHOOK_SECRET',
    'GLOWNSCAN_SEPAY_BANK_ACCOUNT_NUMBER',
    'GLOWNSCAN_BANK_ACCOUNT_NAME',
    'GLOWNSCAN_BANK_BIN',
    'GLOWNSCAN_REDIS_URL',
  ];
  for (const key of required)
    if (typeof env[key] !== 'string' || !env[key].trim())
      throw new Error(`${key} is required.`);
  if ((env.GLOWNSCAN_JWT_ACCESS_SECRET as string).length < 32)
    throw new Error(
      'GLOWNSCAN_JWT_ACCESS_SECRET must contain at least 32 characters.',
    );
  for (const key of [
    'GLOWNSCAN_DATABASE_POOL_MAX',
    'GLOWNSCAN_DATABASE_QUERY_TIMEOUT_MS',
    'GLOWNSCAN_DATABASE_IDLE_TIMEOUT_MS',
    'GLOWNSCAN_ANALYSIS_DAILY_QUOTA_FREE',
    'GLOWNSCAN_ANALYSIS_DAILY_QUOTA_PREMIUM',
    'GLOWNSCAN_ANALYSIS_IMAGE_MAX_BYTES',
    'GLOWNSCAN_ANALYSIS_IMAGE_DOWNLOAD_TIMEOUT_MS',
    'GLOWNSCAN_PAYMENT_ORDER_TTL_MINUTES',
    'GLOWNSCAN_ACCESS_TOKEN_TTL_SECONDS',
    'GLOWNSCAN_REFRESH_TOKEN_TTL_DAYS',
    'GLOWNSCAN_REFRESH_SESSION_ABSOLUTE_TTL_DAYS',
    'GLOWNSCAN_ANALYSIS_WORKER_CONCURRENCY',
    'GLOWNSCAN_ANALYSIS_OUTBOX_POLL_MS',
    'GLOWNSCAN_ANALYSIS_WORKER_RECLAIM_AFTER_SECONDS',
  ]) {
    if (
      env[key] !== undefined &&
      (!Number.isInteger(Number(env[key])) || Number(env[key]) < 1)
    )
      throw new Error(`${key} must be a positive integer.`);
  }
  const refreshTtl = Number(env.GLOWNSCAN_REFRESH_TOKEN_TTL_DAYS ?? 30);
  const absoluteTtl = Number(
    env.GLOWNSCAN_REFRESH_SESSION_ABSOLUTE_TTL_DAYS ?? 90,
  );
  if (absoluteTtl < refreshTtl)
    throw new Error(
      'GLOWNSCAN_REFRESH_SESSION_ABSOLUTE_TTL_DAYS must be greater than or equal to GLOWNSCAN_REFRESH_TOKEN_TTL_DAYS.',
    );
  return env;
}
