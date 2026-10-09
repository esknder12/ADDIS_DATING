import { Router } from 'express';
import { createTelegramAuthMiddleware } from '../middleware/telegramAuth.js';
import { notifyAfterSwipe } from './swipeNotifications.js';

const swipeActions = new Set(['pass', 'like', 'super_like']);

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

function normalizeSwipeAction(value) {
  if (value === 'superlike') return 'super_like';
  return value;
}

export function createSwipeRouter({ appRepository, runtimeConfig }) {
  const router = Router();
  router.use(createTelegramAuthMiddleware(runtimeConfig));

  router.post('/', async (req, res, next) => {
    try {
      if (!appRepository.isAvailable) return unavailableResponse(res);

      const swipedUserId = String(req.body?.swipedUserId ?? req.body?.profileId ?? '').trim();
      const action = normalizeSwipeAction(String(req.body?.action ?? ''));
      if (!/^[1-9]\d{0,18}$/.test(swipedUserId) || !swipeActions.has(action)) {
        return invalid(res, 'Swipe action or user ID is invalid.');
      }

      const outcome = await appRepository.saveSwipe(req.telegramUser.id, swipedUserId, action);
      if (!outcome) return userNotFound(res);
      if (!outcome.profile) return invalid(res, 'Unknown or unavailable profile.', 'UNKNOWN_PROFILE');
      await notifyAfterSwipe(req, outcome);

      const matchedUser = outcome.match?.matchedUser
        ? { ...outcome.match.matchedUser, photo_url: outcome.match.matchedUser.photo }
        : null;
      const match = outcome.match
        ? { ...outcome.match, matchedUser }
        : null;
      return res.json({
        success: true,
        isMatch: Boolean(outcome.matched),
        matched: Boolean(outcome.matched),
        match,
        profile: outcome.profile,
      });
    } catch (error) {
      return next(error);
    }
  });

  router.post('/rewind', async (req, res, next) => {
    try {
      if (!appRepository.isAvailable) return unavailableResponse(res);

      const outcome = await appRepository.rewindLastSwipe(req.telegramUser.id);
      if (!outcome) return userNotFound(res);
      if (!outcome.restored) {
        return res.status(404).json({
          error: { code: 'NO_SWIPE_TO_REWIND', message: 'There is no swipe to undo yet.' },
        });
      }
      return res.json({
        success: true,
        restoredProfile: outcome.restoredProfile || null,
      });
    } catch (error) {
      return next(error);
    }
  });

  return router;
}
