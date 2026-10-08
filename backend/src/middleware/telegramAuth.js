import crypto from 'node:crypto';
import { config } from '../config/env.js';

export class TelegramAuthError extends Error {
  constructor(message, code = 'INVALID_TELEGRAM_AUTH') {
    super(message);
    this.name = 'TelegramAuthError';
    this.code = code;
  }
}

function safeHashEquals(expectedHex, receivedHex) {
  if (!/^[a-f\d]{64}$/i.test(receivedHex || '')) return false;

  const expected = Buffer.from(expectedHex, 'hex');
  const received = Buffer.from(receivedHex, 'hex');
  return expected.length === received.length && crypto.timingSafeEqual(expected, received);
}

/**
 * Validate Telegram Mini App initData using the algorithm documented at:
 * https://core.telegram.org/bots/webapps#validating-data-received-via-the-mini-app
 */
export function validateTelegramInitData(
  initData,
  botToken,
  {
    maxAgeSeconds = 24 * 60 * 60,
    nowSeconds = Math.floor(Date.now() / 1000),
  } = {},
) {
  if (!initData || typeof initData !== 'string') {
    throw new TelegramAuthError('Telegram auth data is missing', 'MISSING_INIT_DATA');
  }
  if (!botToken) {
    throw new TelegramAuthError('Telegram authentication is not configured', 'AUTH_NOT_CONFIGURED');
  }

  const params = new URLSearchParams(initData);
  const receivedHash = params.get('hash');
  if (!receivedHash) {
    throw new TelegramAuthError('Telegram auth hash is missing', 'MISSING_HASH');
  }

  params.delete('hash');
  const dataCheckString = [...params.entries()]
    .sort(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0))
    .map(([key, value]) => `${key}=${value}`)
    .join('\n');

  const secretKey = crypto
    .createHmac('sha256', 'WebAppData')
    .update(botToken)
    .digest();
  const expectedHash = crypto
    .createHmac('sha256', secretKey)
    .update(dataCheckString)
    .digest('hex');

  if (!safeHashEquals(expectedHash, receivedHash)) {
    throw new TelegramAuthError('Telegram auth signature is invalid', 'INVALID_SIGNATURE');
  }

  const authDate = Number(params.get('auth_date'));
  if (!Number.isInteger(authDate)) {
    throw new TelegramAuthError('Telegram auth date is invalid', 'INVALID_AUTH_DATE');
  }

  const ageSeconds = nowSeconds - authDate;
  if (ageSeconds < -30 || ageSeconds > maxAgeSeconds) {
    throw new TelegramAuthError('Telegram auth data has expired', 'EXPIRED_INIT_DATA');
  }

  let user;
  try {
    user = JSON.parse(params.get('user') || '');
  } catch {
    throw new TelegramAuthError('Telegram user data is invalid', 'INVALID_USER_DATA');
  }

  if (!user || !Number.isSafeInteger(Number(user.id))) {
    throw new TelegramAuthError('Telegram user ID is invalid', 'INVALID_USER_DATA');
  }

  return { user, authDate, queryId: params.get('query_id') || null };
}

function readInitDataHeader(headerValue = '') {
  const firstSpace = headerValue.indexOf(' ');
  if (firstSpace < 0) return null;

  const scheme = headerValue.slice(0, firstSpace);
  const value = headerValue.slice(firstSpace + 1);
  return scheme.toLowerCase() === 'tma' && value ? value : null;
}

export function createTelegramAuthMiddleware(runtimeConfig = config) {
  return function telegramAuthMiddleware(req, res, next) {
    const initData = readInitDataHeader(req.get('authorization'));

    if (!initData) {
      return res.status(401).json({
        error: { code: 'MISSING_INIT_DATA', message: 'Open Dategram from Telegram to continue.' },
      });
    }

    try {
      const auth = validateTelegramInitData(initData, runtimeConfig.botToken, {
        maxAgeSeconds: runtimeConfig.telegramAuthMaxAgeSeconds,
      });
      req.telegramUser = auth.user;
      req.telegramAuth = auth;
      return next();
    } catch (error) {
      if (error instanceof TelegramAuthError) {
        const status = error.code === 'AUTH_NOT_CONFIGURED' ? 503 : 401;
        return res.status(status).json({
          error: { code: error.code, message: error.message },
        });
      }
      return next(error);
    }
  };
}

export const telegramAuthMiddleware = createTelegramAuthMiddleware();
