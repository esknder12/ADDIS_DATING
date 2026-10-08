import crypto from 'node:crypto';

function readBearer(headerValue = '') {
  const firstSpace = headerValue.indexOf(' ');
  if (firstSpace < 0) return null;
  const scheme = headerValue.slice(0, firstSpace);
  const value = headerValue.slice(firstSpace + 1).trim();
  return scheme.toLowerCase() === 'bearer' && value ? value : null;
}

function safeEquals(expected, received) {
  const expectedBuffer = Buffer.from(String(expected));
  const receivedBuffer = Buffer.from(String(received));
  if (expectedBuffer.length !== receivedBuffer.length) return false;
  return crypto.timingSafeEqual(expectedBuffer, receivedBuffer);
}

/**
 * Admin review endpoints approve face-video verification, so they cannot ship open. The token is
 * compared in constant time, mirroring how telegramAuth.js compares signature hashes.
 *
 * When no token is configured the admin router is never mounted, so a missing configuration
 * fails closed (404) rather than open.
 */
export function createAdminAuthMiddleware(runtimeConfig) {
  return function adminAuthMiddleware(req, res, next) {
    const token = runtimeConfig.adminApiToken;
    if (!token) {
      return res.status(503).json({
        error: { code: 'ADMIN_NOT_CONFIGURED', message: 'Admin access is not configured.' },
      });
    }

    const provided = readBearer(req.get('authorization'));
    if (!provided || !safeEquals(token, provided)) {
      return res.status(401).json({
        error: { code: 'ADMIN_UNAUTHORIZED', message: 'Admin credentials are missing or invalid.' },
      });
    }

    req.admin = { identifier: 'admin-token' };
    return next();
  };
}
