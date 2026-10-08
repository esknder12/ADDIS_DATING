import dotenv from 'dotenv';

dotenv.config();

function toBoolean(value, fallback = false) {
  if (value === undefined || value === '') return fallback;
  return ['1', 'true', 'yes', 'on'].includes(String(value).toLowerCase());
}

function toPositiveInteger(value, fallback) {
  const parsed = Number.parseInt(value ?? '', 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function toList(value) {
  return String(value ?? '')
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
}

const nodeEnv = process.env.NODE_ENV || 'development';

export const config = Object.freeze({
  nodeEnv,
  isProduction: nodeEnv === 'production',
  port: toPositiveInteger(process.env.PORT, 4000),
  botToken: process.env.BOT_TOKEN?.trim() || '',
  webappUrl: process.env.WEBAPP_URL?.trim() || '',
  telegramAuthMaxAgeSeconds: toPositiveInteger(
    process.env.TELEGRAM_AUTH_MAX_AGE_SECONDS,
    24 * 60 * 60,
  ),
  databaseUrl: process.env.DATABASE_URL?.trim() || '',
  databaseSsl: toBoolean(process.env.DATABASE_SSL, false),
  corsOrigins: toList(process.env.CORS_ORIGINS),
});

export function assertProductionConfig(runtimeConfig = config) {
  if (!runtimeConfig.isProduction) return;

  const missing = [];
  if (!runtimeConfig.botToken) missing.push('BOT_TOKEN');
  if (!runtimeConfig.webappUrl) missing.push('WEBAPP_URL');
  if (!runtimeConfig.databaseUrl) missing.push('DATABASE_URL');
  if (runtimeConfig.corsOrigins.length === 0) missing.push('CORS_ORIGINS');

  if (missing.length > 0) {
    throw new Error(`Missing required production environment variables: ${missing.join(', ')}`);
  }

  if (!runtimeConfig.webappUrl.startsWith('https://')) {
    throw new Error('WEBAPP_URL must use HTTPS in production');
  }
}
