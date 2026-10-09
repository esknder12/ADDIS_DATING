import { Router } from 'express';
import { createTelegramAuthMiddleware } from '../middleware/telegramAuth.js';
import { dispatchChatMessage } from '../socket/chatEvents.js';

function unavailableResponse(res) {
  return res.status(503).json({
    error: {
      code: 'DATABASE_UNAVAILABLE',
      message: 'Dategram persistence is not configured yet.',
    },
  });
}

export function createMatchesRouter({ appRepository, runtimeConfig }) {
  const router = Router();
  router.use(createTelegramAuthMiddleware(runtimeConfig));

  router.get('/', async (req, res, next) => {
    try {
      if (!appRepository.isAvailable) return unavailableResponse(res);
      const matches = await appRepository.listMatches(req.telegramUser.id);
      if (!matches) {
        return res.status(404).json({
          error: { code: 'USER_NOT_FOUND', message: 'Dategram profile not found.' },
        });
      }
      return res.json({ success: true, matches });
    } catch (error) {
      return next(error);
    }
  });

  router.get('/:matchId/messages', async (req, res, next) => {
    try {
      if (!appRepository.isAvailable) return unavailableResponse(res);
      const messages = await appRepository.listMessages(req.telegramUser.id, req.params.matchId);
      if (!messages) {
        return res.status(404).json({
          error: { code: 'MATCH_NOT_FOUND', message: 'This conversation is not available.' },
        });
      }
      return res.json({ success: true, messages });
    } catch (error) {
      return next(error);
    }
  });

  router.post('/:matchId/messages', async (req, res, next) => {
    try {
      if (!appRepository.isAvailable) return unavailableResponse(res);
      const body = String(req.body?.content ?? req.body?.body ?? '').trim();
      if (body.length < 1 || body.length > 2000) {
        return res.status(422).json({
          error: { code: 'INVALID_INPUT', message: 'Messages must be 1–2000 characters.' },
        });
      }
      let created = null;
      let message;
      if (typeof appRepository.createMessageForTelegramId === 'function') {
        created = await appRepository.createMessageForTelegramId(req.telegramUser.id, req.params.matchId, body);
        message = created?.message || null;
      } else {
        message = await appRepository.addMessage(req.telegramUser.id, req.params.matchId, body);
      }
      if (!message) {
        return res.status(403).json({
          error: { code: 'MATCH_REQUIRED', message: 'You can only message people you matched with.' },
        });
      }
      const published = created
        ? await dispatchChatMessage({
          io: req.app.get('io'),
          appRepository,
          bot: req.app.get('bot'),
          notificationService: req.app.get('notificationService'),
        }, created)
        : null;
      return res.status(201).json({ success: true, message: published || message });
    } catch (error) {
      return next(error);
    }
  });

  return router;
}
