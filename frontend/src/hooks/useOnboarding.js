import { useCallback, useEffect, useRef, useState } from 'react';
import {
  isStepVisibleForGender,
  normalizeGender,
  onboardingFlow,
  resolveOnboardingStep,
  validateOnboardingAnswer,
} from '@dategram/shared/onboarding';
import {
  completeOnboarding,
  getOnboardingState,
  saveOnboardingAnswer,
  saveOnboardingProgress,
} from '../api/client.js';

const initialData = {
  answers: {},
  currentStepIndex: 0,
  currentStepKey: onboardingFlow[0].key,
  completed: false,
};

function errorMessage(error) {
  return error.response?.data?.error?.message
    || error.message
    || 'We could not save your answer. Please try again.';
}

function genderOf(answers) {
  return normalizeGender(answers?.gender);
}

/**
 * Snap a raw step index to the nearest step that belongs to this gender's
 * journey (steps with `showFor` set are skipped). Raw indices stay stable so
 * the API key/index validation keeps working unchanged.
 */
function snapToVisibleIndex(requestedIndex, answers, direction = 1) {
  const gender = genderOf(answers);
  let index = Math.min(Math.max(requestedIndex, 0), onboardingFlow.length - 1);
  while (
    index >= 0
    && index < onboardingFlow.length
    && !isStepVisibleForGender(onboardingFlow[index], gender)
  ) {
    index += direction;
  }
  return Math.min(Math.max(index, 0), onboardingFlow.length - 1);
}

function clampProgress(data) {
  const indexFromKey = onboardingFlow.findIndex((step) => step.key === data?.currentStepKey);
  const requestedIndex = Number.isInteger(data?.currentStepIndex)
    ? data.currentStepIndex
    : indexFromKey;
  const answers = data?.answers && typeof data.answers === 'object' ? data.answers : {};
  const rawIndex = Math.min(
    Math.max(requestedIndex >= 0 ? requestedIndex : 0, 0),
    onboardingFlow.length - 1,
  );
  const currentStepIndex = snapToVisibleIndex(rawIndex, answers, 1);

  return {
    answers,
    currentStepIndex,
    currentStepKey: onboardingFlow[currentStepIndex].key,
    completed: Boolean(data?.completed),
  };
}

export function useOnboarding(user) {
  const [status, setStatus] = useState('loading');
  const [data, setData] = useState(initialData);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const dataRef = useRef(initialData);
  const storageKey = `dategram:onboarding:v2:${user.telegramId}`;

  const applyData = useCallback((nextData) => {
    dataRef.current = nextData;
    setData(nextData);
  }, []);

  const persistDemo = useCallback((nextData) => {
    window.localStorage.setItem(storageKey, JSON.stringify(nextData));
  }, [storageKey]);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setStatus('loading');
      setError('');
      try {
        let loaded;
        if (user.isDemo) {
          const cached = window.localStorage.getItem(storageKey);
          try {
            loaded = cached ? JSON.parse(cached) : initialData;
          } catch {
            window.localStorage.removeItem(storageKey);
            loaded = initialData;
          }
        } else {
          const response = await getOnboardingState();
          loaded = response.onboarding;
        }

        if (!cancelled) {
          applyData(clampProgress(loaded));
          setStatus('ready');
        }
      } catch (loadError) {
        if (!cancelled) {
          setError(errorMessage(loadError));
          setStatus('error');
        }
      }
    }

    load();
    return () => { cancelled = true; };
  }, [applyData, storageKey, user.isDemo]);

  const goToStep = useCallback(async (requestedIndex) => {
    if (saving) return false;
    const current = dataRef.current;
    const direction = requestedIndex >= current.currentStepIndex ? 1 : -1;
    const nextIndex = snapToVisibleIndex(requestedIndex, current.answers, direction);
    const progress = {
      currentStepIndex: nextIndex,
      currentStepKey: onboardingFlow[nextIndex].key,
    };

    setSaving(true);
    setError('');
    try {
      if (!user.isDemo) await saveOnboardingProgress(progress);
      const nextData = { ...current, ...progress };
      applyData(nextData);
      if (user.isDemo) persistDemo(nextData);
      return true;
    } catch (saveError) {
      setError(errorMessage(saveError));
      return false;
    } finally {
      setSaving(false);
    }
  }, [applyData, persistDemo, saving, user.isDemo]);

  const submitAnswer = useCallback(async (answer) => {
    if (saving) return false;
    const current = dataRef.current;
    const step = onboardingFlow[current.currentStepIndex];
    const validation = validateOnboardingAnswer(step.key, answer);
    if (!validation.valid) {
      setError(validation.error);
      return false;
    }

    const nextAnswers = { ...current.answers, [step.key]: validation.value };
    const nextVisibleIndex = snapToVisibleIndex(current.currentStepIndex + 1, nextAnswers, 1);
    const isLastStep = nextVisibleIndex <= current.currentStepIndex
      || current.currentStepIndex === onboardingFlow.length - 1;
    const progress = {
      currentStepIndex: nextVisibleIndex,
      currentStepKey: onboardingFlow[nextVisibleIndex].key,
    };
    const nextData = {
      ...current,
      ...progress,
      answers: nextAnswers,
    };

    setSaving(true);
    setError('');
    try {
      if (user.isDemo) {
        if (isLastStep) nextData.completed = true;
        persistDemo(nextData);
      } else {
        await saveOnboardingAnswer(step.key, validation.value, progress);
        if (isLastStep) {
          await completeOnboarding();
          nextData.completed = true;
        }
      }
      applyData(nextData);
      return true;
    } catch (saveError) {
      setError(errorMessage(saveError));
      return false;
    } finally {
      setSaving(false);
    }
  }, [applyData, persistDemo, saving, user.isDemo]);

  const continueInterstitial = useCallback(() => {
    const currentIndex = dataRef.current.currentStepIndex;
    return goToStep(Math.min(currentIndex + 1, onboardingFlow.length - 1));
  }, [goToStep]);

  const goBack = useCallback(() => {
    return goToStep(dataRef.current.currentStepIndex - 1);
  }, [goToStep]);

  const restartPreview = useCallback(() => {
    if (!user.isDemo) return;
    window.localStorage.removeItem(storageKey);
    applyData(initialData);
    setError('');
  }, [applyData, storageKey, user.isDemo]);

  const retryLoad = useCallback(() => {
    setStatus('loading');
    window.location.reload();
  }, []);

  const gender = genderOf(data.answers);

  return {
    status,
    answers: data.answers,
    gender,
    currentStepIndex: data.currentStepIndex,
    currentStep: resolveOnboardingStep(onboardingFlow[data.currentStepIndex], gender),
    completed: data.completed,
    saving,
    error,
    submitAnswer,
    continueInterstitial,
    goBack,
    restartPreview,
    retryLoad,
  };
}
