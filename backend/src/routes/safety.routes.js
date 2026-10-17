import { Router } from 'express';
import { createTelegramAuthMiddleware } from '../middleware/telegramAuth.js';

const reportReasons = new Set(['harassment', 'spam', 'fake_profile', 'inappropriate_content', 'other']);
const idPattern = /^[1-9]\d{0,18}$/;

function unavailableResponse(res) {
  return res.status(503).json({
    error: {
      code: 'DATABASE_UNAVAILABLE',
      message: 'Dategram persistence is not configured yet.',
    },
  });
}

function invalid(res, message, code = 'INVALID_INPUT') {
  return res.status(422).json({ error: { code, message } });
}

function userNotFound(res) {
  return res.status(404).json({
    error: { code: 'USER_NOT_FOUND', message: 'Dategram profile not found.' },
  });
}

export function createSafetyRouter({ appRepository, runtimeConfig }) {
  const router = Router();
  router.use(createTelegramAuthMiddleware(runtimeConfig));

  router.get('/blocks', async (req, res, next) => {
    try {
      if (!appRepository.isAvailable) return unavailableResponse(res);
      const blocked = await appRepository.listBlockedUsers(req.telegramUser.id);
      if (!blocked) return userNotFound(res);
      return res.json({ success: true, blocked });
    } catch (error) {
      return next(error);
    }
  });

  router.post('/users/:userId/block', async (req, res, next) => {
    try {
      if (!appRepository.isAvailable) return unavailableResponse(res);
      const targetId = String(req.params.userId ?? '').trim();
      if (!idPattern.test(targetId)) return invalid(res, 'Profile id is invalid.');
      const outcome = await appRepository.blockUser(req.telegramUser.id, targetId);
      if (!outcome) return userNotFound(res);
      if (outcome.invalid) return invalid(res, 'You cannot block this profile.');
      return res.json({ success: true, blocked: true });
    } catch (error) {
      return next(error);
    }
  });

  router.delete('/users/:userId/block', async (req, res, next) => {
    try {
      if (!appRepository.isAvailable) return unavailableResponse(res);
      const targetId = String(req.params.userId ?? '').trim();
      if (!idPattern.test(targetId)) return invalid(res, 'Profile id is invalid.');
      const outcome = await appRepository.unblockUser(req.telegramUser.id, targetId);
      if (!outcome) return userNotFound(res);
      return res.json({ success: true, unblocked: outcome.unblocked });
    } catch (error) {
      return next(error);
    }
  });

  router.post('/users/:userId/report', async (req, res, next) => {
    try {
      if (!appRepository.isAvailable) return unavailableResponse(res);
      const targetId = String(req.params.userId ?? '').trim();
      const reason = String(req.body?.reason ?? '').trim().toLowerCase();
      const details = String(req.body?.details ?? '').trim();
      if (!idPattern.test(targetId)) return invalid(res, 'Profile id is invalid.');
      if (!reportReasons.has(reason)) return invalid(res, 'Report reason is invalid.');
      if (details.length > 500) return invalid(res, 'Details must be 500 characters or fewer.');
      const outcome = await appRepository.reportUser(req.telegramUser.id, targetId, {
        reason,
        details,
        block: req.body?.block !== false,
      });
      if (!outcome) return userNotFound(res);
      if (outcome.invalid) return invalid(res, 'You cannot report this profile.');
      return res.status(201).json({ success: true, report: outcome.report, blocked: outcome.blocked });
    } catch (error) {
      return next(error);
    }
  });

  return router;
}
