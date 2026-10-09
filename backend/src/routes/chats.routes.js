import { Router } from 'express';
import { createTelegramAuthMiddleware } from '../middleware/telegramAuth.js';

export function createChatsRouter({ appRepository, runtimeConfig }) {
  const router = Router();
  router.use(createTelegramAuthMiddleware(runtimeConfig));

  router.get('/', async (req, res, next) => {
    try {
      if (!appRepository.isAvailable) {
        return res.status(503).json({
          error: {
            code: 'DATABASE_UNAVAILABLE',
            message: 'Dategram persistence is not configured yet.',
          },
        });
      }
      const chats = await appRepository.listChats(req.telegramUser.id);
      if (!chats) {
        return res.status(404).json({
          error: { code: 'USER_NOT_FOUND', message: 'Dategram profile not found.' },
        });
      }
      return res.json({ success: true, chats });
    } catch (error) {
      return next(error);
    }
  });

  return router;
}
