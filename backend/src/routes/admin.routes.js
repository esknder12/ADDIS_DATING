import crypto from 'node:crypto';
import { Router } from 'express';

const grantReasons = new Set(['purchase', 'promo_gift', 'referral', 'campaign', 'support']);

function secretMatches(expected, received) {
  if (!expected || !received) return false;
  const expectedBuffer = Buffer.from(expected);
  const receivedBuffer = Buffer.from(received);
  return expectedBuffer.length === receivedBuffer.length
    && crypto.timingSafeEqual(expectedBuffer, receivedBuffer);
}

function errorResponse(res, status, code, message) {
  return res.status(status).json({ error: { code, message } });
}

export function createAdminRouter({ appRepository, runtimeConfig }) {
  const router = Router();

  router.post('/vip/grant', async (req, res, next) => {
    try {
      if (!runtimeConfig.adminApiKey) {
        return errorResponse(res, 503, 'ADMIN_AUTH_NOT_CONFIGURED', 'VIP grants are not configured.');
      }
      if (!secretMatches(runtimeConfig.adminApiKey, req.get('x-admin-key'))) {
        return errorResponse(res, 401, 'ADMIN_UNAUTHORIZED', 'Admin authorization is required.');
      }
      if (!appRepository.isAvailable) {
        return errorResponse(res, 503, 'DATABASE_UNAVAILABLE', 'Dategram persistence is not configured yet.');
      }

      const userId = String(req.body?.userId ?? '').trim();
      const months = Number(req.body?.months);
      const reason = String(req.body?.reason ?? 'promo_gift').trim();
      let validUserId = false;
      try {
        const numericUserId = BigInt(userId);
        validUserId = numericUserId > 0n && numericUserId <= 9_223_372_036_854_775_807n;
      } catch {
        validUserId = false;
      }
      if (!/^[1-9]\d{0,18}$/.test(userId) || !validUserId
          || !Number.isSafeInteger(months) || months < 1 || months > 60
          || !grantReasons.has(reason)) {
        return errorResponse(res, 422, 'INVALID_INPUT', 'User, VIP duration, or grant reason is invalid.');
      }

      const grant = await appRepository.grantVip(userId, months, reason);
      if (!grant) return errorResponse(res, 404, 'USER_NOT_FOUND', 'Dategram profile not found.');

      const notifications = req.app.get('notificationService');
      await notifications?.sendVipGrantedNotification(req.app.get('bot'), grant.id);
      return res.json({ success: true, grant });
    } catch (error) {
      return next(error);
    }
  });

  return router;
}
