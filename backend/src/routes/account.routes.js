import { Router } from 'express';
import { cloudinary, cloudinaryConfigured } from '../config/cloudinary.js';
import { createTelegramAuthMiddleware } from '../middleware/telegramAuth.js';

export function createAccountRouter({ appRepository, runtimeConfig }) {
  const router = Router();
  router.use(createTelegramAuthMiddleware(runtimeConfig));

  router.delete('/account', async (req, res, next) => {
    try {
      if (!appRepository.isAvailable) {
        return res.status(503).json({
          error: {
            code: 'DATABASE_UNAVAILABLE',
            message: 'Dategram persistence is not configured yet.',
          },
        });
      }
      const confirmation = String(req.body?.confirmation ?? '').trim();
      if (confirmation !== 'DELETE') {
        return res.status(422).json({
          error: { code: 'INVALID_INPUT', message: 'Type DELETE to confirm account deletion.' },
        });
      }
      const outcome = await appRepository.deleteAccount(req.telegramUser.id);
      if (!outcome) {
        return res.status(404).json({
          error: { code: 'USER_NOT_FOUND', message: 'Dategram profile not found.' },
        });
      }
      // Best-effort remote photo cleanup: the DB rows are already gone, so a
      // Cloudinary outage must never fail the deletion itself.
      if (cloudinaryConfigured && outcome.cloudinaryPublicIds.length > 0) {
        await Promise.allSettled(outcome.cloudinaryPublicIds.map((publicId) =>
          cloudinary.uploader.destroy(publicId, { invalidate: true }),
        ));
      }
      return res.json({ success: true, deleted: true });
    } catch (error) {
      return next(error);
    }
  });

  return router;
}
