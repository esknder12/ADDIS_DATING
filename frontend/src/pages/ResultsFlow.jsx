import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { computeMatchResult, resultsFlow } from '@dategram/shared/results';
import { getOnboardingState } from '../api/client.js';
import { AnswerAnalysisScreen, CandidateSearchScreen } from '../components/results/AnalysisScreens.jsx';
import {
  EmailCaptureScreen,
  MatchPlanScreen,
  MatchResultScreen,
  NameCaptureScreen,
} from '../components/results/ResultScreens.jsx';
import ScratchScreen from '../components/results/ScratchScreen.jsx';
import OnboardingTopBar from '../components/onboarding/OnboardingTopBar.jsx';
import {
  loadOnboardingAnswers,
  ONBOARDING_STORAGE_PREFIX,
  resetAppState,
} from '../lib/demoStore.js';

function errorMessage(error) {
  return error?.response?.data?.error?.message
    || error?.message
    || 'Something went wrong. Please try again.';
}

export default function ResultsFlow({ user, appData, onFinished }) {
  const [stepIndex, setStepIndex] = useState(0);
  const [answers, setAnswers] = useState(null);
  const [email, setEmail] = useState(appData?.profile?.email || '');
  const [name, setName] = useState(appData?.profile?.name || user.firstName || '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const advancedRef = useRef(false);

  const step = resultsFlow[stepIndex];
  useEffect(() => { advancedRef.current = false; }, [stepIndex]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        if (user.isDemo) {
          if (!cancelled) setAnswers(loadOnboardingAnswers(user.telegramId));
        } else {
          const response = await getOnboardingState();
          if (!cancelled) setAnswers(response.onboarding.answers);
        }
      } catch (loadError) {
        if (!cancelled) setError(errorMessage(loadError));
      }
    })();
    return () => { cancelled = true; };
  }, [user.isDemo, user.telegramId]);

  const result = useMemo(() => computeMatchResult(answers || {}), [answers]);

  const advance = useCallback(() => {
    if (advancedRef.current) return;
    advancedRef.current = true;
    setError('');
    setStepIndex((index) => {
      if (index >= resultsFlow.length - 1) {
        window.setTimeout(onFinished, 0);
        return index;
      }
      return index + 1;
    });
  }, [onFinished]);

  const finish = useCallback(() => {
    if (advancedRef.current) return;
    advancedRef.current = true;
    onFinished();
  }, [onFinished]);

  const persistLead = useCallback(async ({ nextEmail, nextName }) => {
    setSaving(true);
    setError('');
    try {
      await appData.saveConversionLead({
        name: nextName ?? name,
        email: nextEmail ?? email,
        results: result,
      });
      return true;
    } catch (saveError) {
      setError(errorMessage(saveError));
      return false;
    } finally {
      setSaving(false);
    }
  }, [appData, email, name, result]);

  const handleEmailSubmit = useCallback(async (value) => {
    setEmail(value);
    advance();
  }, [advance]);

  const handleNameSubmit = useCallback(async (value) => {
    setName(value);
    if (await persistLead({ nextEmail: email || null, nextName: value })) advance();
  }, [advance, email, persistLead]);

  const handleRedeem = useCallback(async () => {
    setSaving(true);
    setError('');
    try {
      await appData.applyPromo({ promoCode: step.promoCode, percent: step.percent });
      return true;
    } catch (promoError) {
      setError(errorMessage(promoError));
      return false;
    } finally {
      setSaving(false);
    }
  }, [appData, step]);

  if (answers === null && !error) {
    return (
      <main className="onboarding-state">
        <h1>Crunching your answers</h1>
        <p>Preparing your personal result...</p>
        <span className="state-loader" />
      </main>
    );
  }

  return (
    <div className="onboarding-shell">
      <OnboardingTopBar
        canGoBack={stepIndex >= 3}
        onBack={() => setStepIndex((index) => Math.max(0, index - 1))}
        saving={saving}
        demo={user.isDemo}
        onRestart={() => {
          if (!user.isDemo) return;
          resetAppState(user.telegramId);
          window.localStorage.removeItem(`${ONBOARDING_STORAGE_PREFIX}:${user.telegramId}`);
          window.location.reload();
        }}
      />
      <div className="onboarding-stage" key={step.key}>
        {step.kind === 'analysis' && (
          <AnswerAnalysisScreen step={step} onFinished={advance} />
        )}
        {step.kind === 'search' && (
          <CandidateSearchScreen step={step} onFinished={advance} />
        )}
        {step.kind === 'result' && (
          <MatchResultScreen
            step={step}
            result={result}
            photoUrl={user.photoUrl}
            onContinue={advance}
          />
        )}
        {step.kind === 'email' && (
          <EmailCaptureScreen
            step={step}
            onSubmit={handleEmailSubmit}
            onSkip={advance}
            saving={saving}
            error={error}
          />
        )}
        {step.kind === 'name' && (
          <NameCaptureScreen
            step={step}
            defaultValue={name}
            onSubmit={handleNameSubmit}
            saving={saving}
            error={error}
          />
        )}
        {step.kind === 'plan' && (
          <MatchPlanScreen step={step} name={name || user.firstName} onContinue={advance} />
        )}
        {step.kind === 'discount' && (
          <ScratchScreen
            step={step}
            saving={saving}
            error={error}
            onRedeem={handleRedeem}
            onContinue={finish}
          />
        )}
      </div>
    </div>
  );
}
