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

export function createLikesRouter({ appRepository, runtimeConfig }) {
  const router = Router();
  router.use(createTelegramAuthMiddleware(runtimeConfig));

  router.get('/received', async (req, res, next) => {
    try {
      if (!appRepository.isAvailable) return unavailableResponse(res);
      const result = await appRepository.listLikes(req.telegramUser.id);
      if (!result) {
        return res.status(404).json({
          error: { code: 'USER_NOT_FOUND', message: 'Dategram profile not found.' },
        });
      }

      const likes = result.likedYou.map((like) => (like.isLocked
        ? {
          swipeId: like.swipeId,
          isLocked: true,
          teaserText: like.teaserText,
          blurredPhotoUrl: like.blurredPhotoUrl,
        }
        : {
          swipeId: like.swipeId,
          isLocked: false,
          userId: like.id,
          name: like.name,
          age: like.age,
          city: like.city,
          country: like.country,
          photoUrl: like.photo,
          isVerified: like.verified,
          action: like.action,
        }));

      return res.json({
        success: true,
        likes,
        totalCount: result.totalLikes,
        lockedCount: result.lockedCount,
        isVip: result.isVip,
      });
    } catch (error) {
      return next(error);
    }
  });

  return router;
}
