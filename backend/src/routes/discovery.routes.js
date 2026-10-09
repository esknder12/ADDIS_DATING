import { Router } from 'express';
import { createTelegramAuthMiddleware } from '../middleware/telegramAuth.js';

function unavailableResponse(res) {
  return res.status(503).json({
    error: {
      code: 'DATABASE_UNAVAILABLE',
      message: 'Dategram persistence is not configured yet.',
    },
  });
}

function userNotFound(res) {
  return res.status(404).json({
    error: { code: 'USER_NOT_FOUND', message: 'Dategram profile not found.' },
  });
}

function integerParam(value, fallback, minimum, maximum) {
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed)) return fallback;
  return Math.max(minimum, Math.min(maximum, parsed));
}

export function createDiscoveryRouter({ appRepository, runtimeConfig }) {
  const router = Router();
  router.use(createTelegramAuthMiddleware(runtimeConfig));

  router.get('/', async (req, res, next) => {
    try {
      if (!appRepository.isAvailable) return unavailableResponse(res);

      const result = await appRepository.listDiscover(req.telegramUser.id, {
        limit: integerParam(req.query.limit, 10, 1, 30),
        offset: integerParam(req.query.offset, 0, 0, 100_000),
      });
      if (result === null) return userNotFound(res);

      // Accept the legacy array return shape while migrating older repository
      // adapters; the current implementation also returns pagination metadata.
      const profiles = Array.isArray(result) ? result : result.profiles;
      return res.json({
        success: true,
        profiles: profiles || [],
        hasMore: Array.isArray(result) ? false : Boolean(result.hasMore),
      });
    } catch (error) {
      return next(error);
    }
  });

  return router;
}
