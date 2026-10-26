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

  router.get('/reports', async (req, res, next) => {
    try {
      if (!runtimeConfig.adminApiKey) {
        return errorResponse(res, 503, 'ADMIN_AUTH_NOT_CONFIGURED', 'Report review is not configured.');
      }
      if (!secretMatches(runtimeConfig.adminApiKey, req.get('x-admin-key'))) {
        return errorResponse(res, 401, 'ADMIN_UNAUTHORIZED', 'Admin authorization is required.');
      }
      if (!appRepository.isAvailable || typeof appRepository.listSafetyReports !== 'function') {
        return errorResponse(res, 503, 'DATABASE_UNAVAILABLE', 'Dategram persistence is not configured yet.');
      }
      const limit = Number(req.query.limit);
      const reports = await appRepository.listSafetyReports({
        status: req.query.status,
        limit: Number.isSafeInteger(limit) ? limit : 50,
      });
      return res.json({ success: true, reports });
    } catch (error) {
      return next(error);
    }
  });

  router.patch('/reports/:reportId', async (req, res, next) => {
    try {
      if (!runtimeConfig.adminApiKey) {
        return errorResponse(res, 503, 'ADMIN_AUTH_NOT_CONFIGURED', 'Report review is not configured.');
      }
      if (!secretMatches(runtimeConfig.adminApiKey, req.get('x-admin-key'))) {
        return errorResponse(res, 401, 'ADMIN_UNAUTHORIZED', 'Admin authorization is required.');
      }
      if (!appRepository.isAvailable || typeof appRepository.updateSafetyReportStatus !== 'function') {
        return errorResponse(res, 503, 'DATABASE_UNAVAILABLE', 'Dategram persistence is not configured yet.');
      }
      const outcome = await appRepository.updateSafetyReportStatus(req.params.reportId, req.body?.status);
      if (outcome?.invalid) {
        return errorResponse(res, 422, 'INVALID_INPUT', 'Report id or status is invalid.');
      }
      if (!outcome) return errorResponse(res, 404, 'REPORT_NOT_FOUND', 'Safety report not found.');
      return res.json({ success: true, report: outcome });
    } catch (error) {
      return next(error);
    }
  });

  async function setActive(req, res, next, isActive) {
    try {
      if (!runtimeConfig.adminApiKey) {
        return errorResponse(res, 503, 'ADMIN_AUTH_NOT_CONFIGURED', 'User moderation is not configured.');
      }
      if (!secretMatches(runtimeConfig.adminApiKey, req.get('x-admin-key'))) {
        return errorResponse(res, 401, 'ADMIN_UNAUTHORIZED', 'Admin authorization is required.');
      }
      if (!appRepository.isAvailable || typeof appRepository.setUserActiveStatus !== 'function') {
        return errorResponse(res, 503, 'DATABASE_UNAVAILABLE', 'Dategram persistence is not configured yet.');
      }
      const outcome = await appRepository.setUserActiveStatus(req.params.userId, isActive);
      if (outcome?.invalid) {
        return errorResponse(res, 422, 'INVALID_INPUT', 'User id is invalid.');
      }
      if (!outcome) return errorResponse(res, 404, 'USER_NOT_FOUND', 'Dategram profile not found.');
      return res.json({ success: true, user: outcome });
    } catch (error) {
      return next(error);
    }
  }

  router.post('/users/:userId/ban', (req, res, next) => setActive(req, res, next, false));
  router.post('/users/:userId/unban', (req, res, next) => setActive(req, res, next, true));

  router.get('/photos', async (req, res, next) => {
    try {
      if (!runtimeConfig.adminApiKey) {
        return errorResponse(res, 503, 'ADMIN_AUTH_NOT_CONFIGURED', 'Photo review is not configured.');
      }
      if (!secretMatches(runtimeConfig.adminApiKey, req.get('x-admin-key'))) {
        return errorResponse(res, 401, 'ADMIN_UNAUTHORIZED', 'Admin authorization is required.');
      }
      if (!appRepository.isAvailable || typeof appRepository.listPhotosForReview !== 'function') {
        return errorResponse(res, 503, 'DATABASE_UNAVAILABLE', 'Dategram persistence is not configured yet.');
      }
      const limit = Number(req.query.limit);
      const photos = await appRepository.listPhotosForReview({
        status: req.query.status,
        limit: Number.isSafeInteger(limit) ? limit : 50,
      });
      return res.json({ success: true, photos });
    } catch (error) {
      return next(error);
    }
  });

  router.patch('/photos/:photoId', async (req, res, next) => {
    try {
      if (!runtimeConfig.adminApiKey) {
        return errorResponse(res, 503, 'ADMIN_AUTH_NOT_CONFIGURED', 'Photo review is not configured.');
      }
      if (!secretMatches(runtimeConfig.adminApiKey, req.get('x-admin-key'))) {
        return errorResponse(res, 401, 'ADMIN_UNAUTHORIZED', 'Admin authorization is required.');
      }
      if (!appRepository.isAvailable || typeof appRepository.updatePhotoStatus !== 'function') {
        return errorResponse(res, 503, 'DATABASE_UNAVAILABLE', 'Dategram persistence is not configured yet.');
      }
      const outcome = await appRepository.updatePhotoStatus(req.params.photoId, req.body?.status);
      if (outcome?.invalid) {
        return errorResponse(res, 422, 'INVALID_INPUT', 'Photo id or status is invalid.');
      }
      if (!outcome) return errorResponse(res, 404, 'PHOTO_NOT_FOUND', 'Photo not found.');
      return res.json({ success: true, photo: outcome });
    } catch (error) {
      return next(error);
    }
  });

  return router;
}
