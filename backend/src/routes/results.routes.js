import { Router } from 'express';
import { createTelegramAuthMiddleware } from '../middleware/telegramAuth.js';

export const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
export const MAX_EMAIL_LENGTH = 320;
export const MIN_NAME_LENGTH = 2;
export const MAX_NAME_LENGTH = 80;

export function validateEmailInput(raw) {
  if (raw === undefined || raw === null || raw === '') return { valid: true, value: null };
  if (typeof raw !== 'string') return { valid: false };

  const value = raw.trim();
  if (value.length === 0) return { valid: true, value: null };
  if (value.length > MAX_EMAIL_LENGTH || !EMAIL_PATTERN.test(value)) return { valid: false };
  return { valid: true, value: value.toLowerCase() };
}

export function validateNameInput(raw) {
  if (typeof raw !== 'string') return { valid: false };

  // eslint-disable-next-line no-control-regex
  const value = raw.replace(/[\u0000-\u001f\u007f]/g, '').replace(/\s+/g, ' ').trim();
  if (value.length < MIN_NAME_LENGTH || value.length > MAX_NAME_LENGTH) return { valid: false };
  return { valid: true, value };
}

function unavailableResponse(res) {
  return res.status(503).json({
    error: {
      code: 'DATABASE_UNAVAILABLE',
      message: 'Dategram persistence is not configured yet.',
    },
  });
}

function notFoundResponse(res) {
  return res.status(404).json({
    error: { code: 'USER_NOT_FOUND', message: 'Dategram profile not found.' },
  });
}

function invalidResponse(res, code, message) {
  return res.status(422).json({ error: { code, message } });
}

export function createResultsRouter({ resultsRepository, resultsService, runtimeConfig }) {
  const router = Router();
  const requireTelegram = createTelegramAuthMiddleware(runtimeConfig);

  router.use(requireTelegram);

  router.get('/', async (req, res, next) => {
    try {
      if (!resultsRepository.isAvailable) return unavailableResponse(res);

      const results = await resultsService.getResults(req.telegramUser.id);
      if (!results) return notFoundResponse(res);
      if (results.score === null) {
        return res.status(409).json({
          error: {
            code: 'SCORE_NOT_CALCULATED',
            message: 'Your match analysis has not run yet.',
          },
        });
      }
      return res.json({ success: true, results });
    } catch (error) {
      return next(error);
    }
  });

  router.post('/calculate-score', async (req, res, next) => {
    try {
      if (!resultsRepository.isAvailable) return unavailableResponse(res);

      const outcome = await resultsService.calculateScore(req.telegramUser.id);
      if (!outcome) return notFoundResponse(res);
      return res.json({ success: true, reused: outcome.reused, results: outcome.results });
    } catch (error) {
      return next(error);
    }
  });

  router.post('/email', async (req, res, next) => {
    try {
      if (!resultsRepository.isAvailable) return unavailableResponse(res);

      const validation = validateEmailInput(req.body?.email);
      if (!validation.valid) {
        return invalidResponse(res, 'INVALID_EMAIL', 'Enter a valid email address, or skip this step.');
      }

      const results = await resultsService.setEmail(req.telegramUser.id, validation.value);
      if (!results) return notFoundResponse(res);
      return res.json({ success: true, results });
    } catch (error) {
      return next(error);
    }
  });

  router.post('/name', async (req, res, next) => {
    try {
      if (!resultsRepository.isAvailable) return unavailableResponse(res);

      const validation = validateNameInput(req.body?.name);
      if (!validation.valid) {
        return invalidResponse(
          res,
          'INVALID_NAME',
          `Enter your name using ${MIN_NAME_LENGTH} to ${MAX_NAME_LENGTH} characters.`,
        );
      }

      const results = await resultsService.setName(req.telegramUser.id, validation.value);
      if (!results) return notFoundResponse(res);
      return res.json({ success: true, results });
    } catch (error) {
      return next(error);
    }
  });

  router.post('/promo', async (req, res, next) => {
    try {
      if (!resultsRepository.isAvailable) return unavailableResponse(res);

      const outcome = await resultsService.ensurePromo(req.telegramUser.id);
      if (outcome.status === 'not-found') return notFoundResponse(res);
      if (outcome.status === 'unavailable') {
        return res.status(409).json({
          error: { code: 'NO_PROMO_AVAILABLE', message: 'We could not create your discount. Please try again.' },
        });
      }
      return res.json({ success: true, promo: outcome.promo });
    } catch (error) {
      return next(error);
    }
  });

  router.post('/complete', async (req, res, next) => {
    try {
      if (!resultsRepository.isAvailable) return unavailableResponse(res);

      const outcome = await resultsService.complete(req.telegramUser.id);
      if (outcome.status === 'not-found') return notFoundResponse(res);
      if (outcome.status === 'quiz-incomplete') {
        return res.status(409).json({
          error: { code: 'QUIZ_INCOMPLETE', message: 'Finish your onboarding answers first.' },
        });
      }
      if (outcome.status === 'name-required') {
        return res.status(409).json({
          error: { code: 'NAME_REQUIRED', message: 'Add your name before entering Dategram.' },
        });
      }
      return res.json({ success: true, results: outcome.results, user: outcome.user });
    } catch (error) {
      return next(error);
    }
  });

  return router;
}
