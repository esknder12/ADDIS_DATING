import { giftById, vipPlanById } from '@dategram/shared/catalog';
import {
  computeMatchResult,
  validateDisplayName,
  validateEmail,
  validatePromoCode,
} from '@dategram/shared/results';
import { Router } from 'express';
import { createTelegramAuthMiddleware } from '../middleware/telegramAuth.js';

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

export function createAppRouter({ appRepository, onboardingRepository, runtimeConfig }) {
  const router = Router();
  const requireTelegram = createTelegramAuthMiddleware(runtimeConfig);

  router.use(requireTelegram);

  function repositoriesAvailable() {
    return appRepository.isAvailable && onboardingRepository.isAvailable;
  }

  /** Server is the source of truth for the score (implementation rule 4). */
  async function computeResultsFor(telegramId) {
    const state = await onboardingRepository.getState(telegramId);
    if (!state) return { missing: true };
    if (!state.completed) return { incomplete: true };
    return { results: computeMatchResult(state.answers) };
  }

  router.get('/results', async (req, res, next) => {
    try {
      if (!repositoriesAvailable()) return unavailableResponse(res);
      const outcome = await computeResultsFor(req.telegramUser.id);
      if (outcome.missing) return userNotFound(res);
      if (outcome.incomplete) {
        return res.status(409).json({
          error: {
            code: 'ONBOARDING_INCOMPLETE',
            message: 'Finish onboarding to unlock your match results.',
          },
        });
      }
      return res.json({ success: true, results: outcome.results });
    } catch (error) {
      return next(error);
    }
  });

  router.post('/conversion', async (req, res, next) => {
    try {
      if (!repositoriesAvailable()) return unavailableResponse(res);

      const nameCheck = validateDisplayName(req.body?.name);
      if (!nameCheck.valid) return invalid(res, nameCheck.error, 'INVALID_NAME');

      const rawEmail = String(req.body?.email ?? '').trim();
      let emailValue = null;
      if (rawEmail.length > 0) {
        const emailCheck = validateEmail(rawEmail);
        if (!emailCheck.valid) return invalid(res, emailCheck.error, 'INVALID_EMAIL');
        emailValue = emailCheck.value;
      }

      const outcome = await computeResultsFor(req.telegramUser.id);
      if (outcome.missing) return userNotFound(res);
      if (outcome.incomplete) {
        return res.status(409).json({
          error: {
            code: 'ONBOARDING_INCOMPLETE',
            message: 'Finish onboarding to unlock your match results.',
          },
        });
      }

      const saved = await appRepository.saveConversion(req.telegramUser.id, {
        results: outcome.results,
        email: emailValue,
        name: nameCheck.value,
      });
      if (!saved) return userNotFound(res);

      return res.json({ success: true, results: outcome.results });
    } catch (error) {
      return next(error);
    }
  });

  router.post('/discount', async (req, res, next) => {
    try {
      if (!repositoriesAvailable()) return unavailableResponse(res);
      const promoCheck = validatePromoCode(req.body?.promoCode);
      if (!promoCheck.valid) return invalid(res, promoCheck.error, 'INVALID_PROMO_CODE');

      const saved = await appRepository.applyDiscount(req.telegramUser.id, {
        promoCode: promoCheck.value,
        percent: promoCheck.percent,
      });
      if (!saved) return userNotFound(res);
      return res.json({ success: true, promoCode: promoCheck.value, percent: promoCheck.percent });
    } catch (error) {
      return next(error);
    }
  });

  router.get('/discover', async (req, res, next) => {
    try {
      if (!repositoriesAvailable()) return unavailableResponse(res);
      const profiles = await appRepository.listDiscover(req.telegramUser.id);
      return res.json({ success: true, profiles });
    } catch (error) {
      return next(error);
    }
  });

  router.post('/swipes', async (req, res, next) => {
    try {
      if (!repositoriesAvailable()) return unavailableResponse(res);
      const profileId = String(req.body?.profileId ?? '');
      const action = String(req.body?.action ?? '');
      if (!profileId || !swipeActions.has(action)) {
        return invalid(res, 'Swipe action or profile is invalid.');
      }

      const outcome = await appRepository.saveSwipe(req.telegramUser.id, profileId, action);
      if (!outcome) return userNotFound(res);
      if (!outcome.profile) {
        return invalid(res, 'Unknown profile.', 'UNKNOWN_PROFILE');
      }
      return res.json({ success: true, matched: outcome.matched, profile: outcome.profile });
    } catch (error) {
      return next(error);
    }
  });

  router.delete('/swipes/last', async (req, res, next) => {
    try {
      if (!repositoriesAvailable()) return unavailableResponse(res);
      const outcome = await appRepository.rewindLastSwipe(req.telegramUser.id);
      if (!outcome) return userNotFound(res);
      if (!outcome.restored) {
        return res.status(409).json({
          error: { code: 'NOTHING_TO_REWIND', message: 'There is no swipe to undo yet.' },
        });
      }
      return res.json({ success: true, restored: outcome.restored });
    } catch (error) {
      return next(error);
    }
  });

  router.get('/likes', async (req, res, next) => {
    try {
      if (!repositoriesAvailable()) return unavailableResponse(res);
      const likes = await appRepository.listLikes(req.telegramUser.id);
      if (!likes) return userNotFound(res);
      return res.json({ success: true, ...likes });
    } catch (error) {
      return next(error);
    }
  });

  router.get('/matches', async (req, res, next) => {
    try {
      if (!repositoriesAvailable()) return unavailableResponse(res);
      const matches = await appRepository.listMatches(req.telegramUser.id);
      if (!matches) return userNotFound(res);
      return res.json({ success: true, matches });
    } catch (error) {
      return next(error);
    }
  });

  router.get('/matches/:matchId/messages', async (req, res, next) => {
    try {
      if (!repositoriesAvailable()) return unavailableResponse(res);
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

  router.post('/matches/:matchId/messages', async (req, res, next) => {
    try {
      if (!repositoriesAvailable()) return unavailableResponse(res);
      const body = String(req.body?.body ?? '').trim();
      if (body.length < 1 || body.length > 2000) {
        return invalid(res, 'Messages must be 1–2000 characters.');
      }

      const message = await appRepository.addMessage(req.telegramUser.id, req.params.matchId, body);
      if (!message) {
        return res.status(403).json({
          error: {
            code: 'MATCH_REQUIRED',
            message: 'You can only message people you matched with.',
          },
        });
      }
      return res.status(201).json({ success: true, message });
    } catch (error) {
      return next(error);
    }
  });

  router.post('/gifts', async (req, res, next) => {
    try {
      if (!repositoriesAvailable()) return unavailableResponse(res);
      const gift = giftById.get(String(req.body?.giftId ?? ''));
      const clientRef = String(req.body?.clientRef ?? '').slice(0, 128);
      if (!gift || !clientRef) {
        return invalid(res, 'Gift or transaction reference is invalid.');
      }

      // Production note (implementation rule 14): grant fulfillment only after
      // the Telegram Stars invoice is confirmed server-side. The preview
      // records the transaction idempotently without charging anything.
      const transaction = await appRepository.sendGift(
        req.telegramUser.id,
        String(req.body?.profileId ?? ''),
        gift,
        clientRef,
      );
      if (!transaction) return userNotFound(res);
      return res.status(201).json({ success: true, transaction });
    } catch (error) {
      return next(error);
    }
  });

  router.post('/premium/activate', async (req, res, next) => {
    try {
      if (!repositoriesAvailable()) return unavailableResponse(res);
      const plan = vipPlanById.get(String(req.body?.planId ?? ''));
      if (!plan) return invalid(res, 'Choose a valid VIP plan.', 'INVALID_PLAN');

      let promoCode = null;
      let percent = null;
      const rawPromo = String(req.body?.promoCode ?? '').trim();
      if (rawPromo.length > 0) {
        const promoCheck = validatePromoCode(rawPromo);
        if (!promoCheck.valid) return invalid(res, promoCheck.error, 'INVALID_PROMO_CODE');
        promoCode = promoCheck.value;
        percent = promoCheck.percent;
      }

      const outcome = await appRepository.activatePremium(req.telegramUser.id, {
        plan,
        promoCode,
        percent,
      });
      if (!outcome) return userNotFound(res);
      return res.json({ success: true, ...outcome });
    } catch (error) {
      return next(error);
    }
  });

  router.post('/verification/request', async (req, res, next) => {
    try {
      if (!repositoriesAvailable()) return unavailableResponse(res);
      const outcome = await appRepository.requestVerification(req.telegramUser.id);
      return res.json({ success: true, status: outcome.status });
    } catch (error) {
      return next(error);
    }
  });

  return router;
}
