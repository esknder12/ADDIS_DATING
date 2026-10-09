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

export function createAiPicksRouter({ appRepository, runtimeConfig }) {
  const router = Router();
  router.use(createTelegramAuthMiddleware(runtimeConfig));

  router.get('/', async (req, res, next) => {
    try {
      if (!appRepository.isAvailable) return unavailableResponse(res);
      const result = await appRepository.listAiPicks(req.telegramUser.id);
      if (!result) {
        return res.status(404).json({
          error: { code: 'USER_NOT_FOUND', message: 'Complete onboarding to get your AI Picks.' },
        });
      }
      return res.json({ success: true, ...result });
    } catch (error) {
      return next(error);
    }
  });

  return router;
}
