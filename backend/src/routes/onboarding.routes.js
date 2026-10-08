import {
  onboardingFlow,
  validateOnboardingAnswer,
} from '@dategram/shared/onboarding';
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

function readProgress(body) {
  const currentStepIndex = Number(body?.currentStepIndex);
  if (!Number.isInteger(currentStepIndex) || currentStepIndex < 0 || currentStepIndex >= onboardingFlow.length) {
    return null;
  }

  const expectedStep = onboardingFlow[currentStepIndex];
  if (body?.currentStepKey !== expectedStep.key) return null;

  return { currentStepIndex, currentStepKey: expectedStep.key };
}

export function createOnboardingRouter({ onboardingRepository, runtimeConfig }) {
  const router = Router();
  const requireTelegram = createTelegramAuthMiddleware(runtimeConfig);

  router.use(requireTelegram);

  router.get('/', async (req, res, next) => {
    try {
      if (!onboardingRepository.isAvailable) return unavailableResponse(res);
      const state = await onboardingRepository.getState(req.telegramUser.id);
      if (!state) {
        return res.status(404).json({
          error: { code: 'USER_NOT_FOUND', message: 'Dategram profile not found.' },
        });
      }
      return res.json({ success: true, onboarding: state });
    } catch (error) {
      return next(error);
    }
  });

  router.put('/answers/:questionKey', async (req, res, next) => {
    try {
      if (!onboardingRepository.isAvailable) return unavailableResponse(res);

      const validation = validateOnboardingAnswer(req.params.questionKey, req.body?.answer);
      if (!validation.valid) {
        return res.status(422).json({
          error: { code: 'INVALID_ANSWER', message: validation.error },
        });
      }

      const progress = readProgress(req.body);
      if (!progress) {
        return res.status(422).json({
          error: { code: 'INVALID_PROGRESS', message: 'Onboarding progress is invalid.' },
        });
      }

      const result = await onboardingRepository.saveAnswer(
        req.telegramUser.id,
        req.params.questionKey,
        validation.value,
        progress,
      );
      if (!result) {
        return res.status(404).json({
          error: { code: 'USER_NOT_FOUND', message: 'Dategram profile not found.' },
        });
      }
      return res.json({ success: true, answer: validation.value, progress });
    } catch (error) {
      return next(error);
    }
  });

  router.put('/progress', async (req, res, next) => {
    try {
      if (!onboardingRepository.isAvailable) return unavailableResponse(res);
      const progress = readProgress(req.body);
      if (!progress) {
        return res.status(422).json({
          error: { code: 'INVALID_PROGRESS', message: 'Onboarding progress is invalid.' },
        });
      }

      const result = await onboardingRepository.saveProgress(req.telegramUser.id, progress);
      if (!result) {
        return res.status(404).json({
          error: { code: 'USER_NOT_FOUND', message: 'Dategram profile not found.' },
        });
      }
      return res.json({ success: true, progress });
    } catch (error) {
      return next(error);
    }
  });

  router.post('/complete', async (req, res, next) => {
    try {
      if (!onboardingRepository.isAvailable) return unavailableResponse(res);
      const result = await onboardingRepository.complete(req.telegramUser.id);
      if (!result) {
        return res.status(404).json({
          error: { code: 'USER_NOT_FOUND', message: 'Dategram profile not found.' },
        });
      }
      if (!result.completed) {
        return res.status(422).json({
          error: {
            code: 'ONBOARDING_INCOMPLETE',
            message: 'Complete every onboarding question before continuing.',
            missingKeys: result.missingKeys,
          },
        });
      }
      return res.json({ success: true, completed: true });
    } catch (error) {
      return next(error);
    }
  });

  return router;
}
