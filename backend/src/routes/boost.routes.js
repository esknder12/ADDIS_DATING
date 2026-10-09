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

export function createBoostRouter({ appRepository, runtimeConfig }) {
  const router = Router();
  router.use(createTelegramAuthMiddleware(runtimeConfig));

  router.post('/activate', async (req, res, next) => {
    try {
      if (!appRepository.isAvailable) return unavailableResponse(res);
      const result = await appRepository.activateBoost(req.telegramUser.id);
      if (!result) {
        return res.status(404).json({
          error: { code: 'USER_NOT_FOUND', message: 'Dategram profile not found.' },
        });
      }
      return res.json({ success: true, ...result });
    } catch (error) {
      return next(error);
    }
  });

  router.get('/status', async (req, res, next) => {
    try {
      if (!appRepository.isAvailable) return unavailableResponse(res);
      const result = await appRepository.getBoostStatus(req.telegramUser.id);
      if (!result) {
        return res.status(404).json({
          error: { code: 'USER_NOT_FOUND', message: 'Dategram profile not found.' },
        });
      }
      return res.json({ success: true, ...result });
    } catch (error) {
      return next(error);
    }
  });

  return router;
}
