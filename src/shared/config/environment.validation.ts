export function validateEnvironment(env: Record<string, unknown>) {
  if (
    env.GLOWNSCAN_ANALYSIS_WEBSOCKET_ENABLED !== undefined &&
    (typeof env.GLOWNSCAN_ANALYSIS_WEBSOCKET_ENABLED !== 'string' ||
      !['true', 'false'].includes(env.GLOWNSCAN_ANALYSIS_WEBSOCKET_ENABLED))
  )
    throw new Error(
      'GLOWNSCAN_ANALYSIS_WEBSOCKET_ENABLED must be true or false.',
    );
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
    'GLOWNSCAN_SEPAY_WEBHOOK_SECRET',
    'GLOWNSCAN_SEPAY_BANK_ACCOUNT_NUMBER',
    'GLOWNSCAN_BANK_ACCOUNT_NAME',
    'GLOWNSCAN_BANK_BIN',
    'GLOWNSCAN_REDIS_URL',
  ];
  for (const key of required)
    if (typeof env[key] !== 'string' || !env[key].trim())
      throw new Error(`${key} is required.`);
  const configuredAnalysisProvider = env.GLOWNSCAN_ANALYSIS_AI_PROVIDER;
  if (
    configuredAnalysisProvider !== undefined &&
    typeof configuredAnalysisProvider !== 'string'
  )
    throw new Error(
      'GLOWNSCAN_ANALYSIS_AI_PROVIDER must be GROQ, OPENAI, or GEMINI.',
    );
  const analysisProvider = (
    typeof configuredAnalysisProvider === 'string'
      ? configuredAnalysisProvider
      : 'GROQ'
  )
    .trim()
    .toUpperCase();
  if (!['GROQ', 'OPENAI', 'GEMINI'].includes(analysisProvider))
    throw new Error(
      'GLOWNSCAN_ANALYSIS_AI_PROVIDER must be GROQ, OPENAI, or GEMINI.',
    );
  const providerKey =
    analysisProvider === 'GROQ'
      ? 'GLOWNSCAN_GROQ_API_KEY'
      : analysisProvider === 'GEMINI'
        ? 'GLOWNSCAN_GEMINI_API_KEY'
        : 'GLOWNSCAN_OPENAI_API_KEY';
  if (typeof env[providerKey] !== 'string' || !env[providerKey].trim())
    throw new Error(`${providerKey} is required for the selected AI provider.`);
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
    'GLOWNSCAN_OPENAI_TIMEOUT_MS',
    'GLOWNSCAN_GROQ_TIMEOUT_MS',
    'GLOWNSCAN_GEMINI_TIMEOUT_MS',
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
