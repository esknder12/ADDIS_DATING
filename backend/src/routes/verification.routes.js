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

function botUnavailableResponse(res) {
  return res.status(503).json({
    error: {
      code: 'BOT_UNAVAILABLE',
      message: 'The Dategram bot is not configured, so verification cannot start.',
    },
  });
}

export function createVerificationRouter({
  verificationRepository,
  notifier,
  runtimeConfig,
  sendInstructions,
}) {
  const router = Router();
  const requireTelegram = createTelegramAuthMiddleware(runtimeConfig);

  router.use(requireTelegram);

  /**
   * Sends the V2 sequence into the user's chat with the bot. The Mini App closes itself
   * afterwards; the messages are already on their way.
   */
  router.post('/request', async (req, res, next) => {
    try {
      if (!verificationRepository.isAvailable) return unavailableResponse(res);
      if (!notifier?.isAvailable) return botUnavailableResponse(res);

      const telegramId = req.telegramUser.id;
      const status = await verificationRepository.getStatus(telegramId);
      if (!status) {
        return res.status(404).json({
          error: { code: 'USER_NOT_FOUND', message: 'Dategram profile not found.' },
        });
      }
      if (status.isVerified || status.status === 'approved') {
        return res.status(409).json({
          error: { code: 'ALREADY_VERIFIED', message: 'Your profile is already verified.' },
        });
      }

      const outcome = await sendInstructions(telegramId);
      if (!outcome.sent) {
        return res.status(502).json({
          error: {
            code: outcome.code === 'BOT_UNAVAILABLE' ? 'BOT_UNAVAILABLE' : 'TELEGRAM_SEND_FAILED',
            message: 'We could not send the verification instructions. Please try again.',
          },
        });
      }

      await verificationRepository.markRequested(telegramId);
      return res.json({ success: true, status: 'requested' });
    } catch (error) {
      return next(error);
    }
  });

  /** Polled by the Mini App so the badge appears without a manual refresh. */
  router.get('/status', async (req, res, next) => {
    try {
      if (!verificationRepository.isAvailable) return unavailableResponse(res);

      const status = await verificationRepository.getStatus(req.telegramUser.id);
      if (!status) {
        return res.status(404).json({
          error: { code: 'USER_NOT_FOUND', message: 'Dategram profile not found.' },
        });
      }

      return res.json({
        success: true,
        isVerified: status.isVerified,
        status: status.status,
        rejectionReason: status.rejectionReason,
        requestedAt: status.requestedAt,
        reviewedAt: status.reviewedAt,
      });
    } catch (error) {
      return next(error);
    }
  });

  return router;
}
