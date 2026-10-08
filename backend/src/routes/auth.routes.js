import { Router } from 'express';
import { createTelegramAuthMiddleware } from '../middleware/telegramAuth.js';

export function createAuthRouter({ userRepository, runtimeConfig }) {
  const router = Router();
  const requireTelegram = createTelegramAuthMiddleware(runtimeConfig);

  router.post('/telegram', requireTelegram, async (req, res, next) => {
    try {
      if (!userRepository.isAvailable) {
        return res.status(503).json({
          error: {
            code: 'DATABASE_UNAVAILABLE',
            message: 'Dategram persistence is not configured yet.',
          },
        });
      }

      const user = await userRepository.upsertTelegramUser(req.telegramUser);
      return res.status(200).json({ success: true, user });
    } catch (error) {
      return next(error);
    }
  });

  router.get('/me', requireTelegram, async (req, res, next) => {
    try {
      if (!userRepository.isAvailable) {
        return res.status(503).json({
          error: {
            code: 'DATABASE_UNAVAILABLE',
            message: 'Dategram persistence is not configured yet.',
          },
        });
      }

      const user = await userRepository.findByTelegramId(req.telegramUser.id);
      if (!user) {
        return res.status(404).json({
          error: { code: 'USER_NOT_FOUND', message: 'Dategram profile not found.' },
        });
      }

      return res.json({ success: true, user });
    } catch (error) {
      return next(error);
    }
  });

  return router;
}
