import { useEffect } from 'react';
import BrandMark from '../components/BrandMark.jsx';
import InterstitialScreen from '../components/onboarding/InterstitialScreen.jsx';
import OnboardingComplete from '../components/onboarding/OnboardingComplete.jsx';
import OnboardingTopBar from '../components/onboarding/OnboardingTopBar.jsx';
import QuestionScreen from '../components/onboarding/QuestionScreen.jsx';
import { useOnboarding } from '../hooks/useOnboarding.js';

function LoadingState() {
  return (
    <main className="onboarding-state">
      <div className="mini-logo-pulse"><BrandMark size={72} /></div>
      <h1>Preparing your questions</h1>
      <p>Personalizing the Dategram experience...</p>
      <span className="state-loader" />
    </main>
  );
}

function ErrorState({ message, onRetry }) {
  return (
    <main className="onboarding-state">
      <div className="onboarding-state__error">!</div>
      <h1>We couldn’t load your progress</h1>
      <p>{message}</p>
      <button type="button" className="onboarding-primary" onClick={onRetry}>TRY AGAIN</button>
    </main>
  );
}

export default function OnboardingFlow({ user, onFinished }) {
  const onboarding = useOnboarding(user);

  useEffect(() => {
    document.querySelector('.question-scroll, .interstitial-scroll')?.scrollTo({ top: 0 });
    window.scrollTo({ top: 0 });
  }, [onboarding.currentStep?.key]);

  if (onboarding.status === 'loading') return <LoadingState />;
  if (onboarding.status === 'error') {
    return <ErrorState message={onboarding.error} onRetry={onboarding.retryLoad} />;
  }

  if (onboarding.completed) {
    return (
      <div className="onboarding-shell">
        <OnboardingTopBar
          canGoBack={false}
          saving={false}
          demo={user.isDemo}
          onRestart={onboarding.restartPreview}
        />
        <OnboardingComplete
          firstName={user.firstName}
          answerCount={Object.keys(onboarding.answers).length}
          onNext={onFinished}
        />
      </div>
    );
  }

  const step = onboarding.currentStep;

  return (
    <div className="onboarding-shell">
      <OnboardingTopBar
        canGoBack={onboarding.currentStepIndex > 0}
        onBack={onboarding.goBack}
        saving={onboarding.saving}
        demo={user.isDemo}
        onRestart={onboarding.restartPreview}
      />
      <div className="onboarding-stage" key={step.key}>
        {step.kind === 'question' ? (
          <QuestionScreen
            step={step}
            user={user}
            gender={onboarding.gender}
            savedAnswer={onboarding.answers[step.key]}
            onSubmit={onboarding.submitAnswer}
            saving={onboarding.saving}
            error={onboarding.error}
          />
        ) : (
          <InterstitialScreen
            step={step}
            gender={onboarding.gender}
            onContinue={onboarding.continueInterstitial}
            saving={onboarding.saving}
            error={onboarding.error}
          />
        )}
      </div>
    </div>
  );
}
