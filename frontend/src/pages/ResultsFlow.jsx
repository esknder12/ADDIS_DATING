import { useCallback, useEffect, useState } from 'react';
import BrandMark from '../components/BrandMark.jsx';
import AnalyzingScreen from '../components/onboarding-results/AnalyzingScreen.jsx';
import EmailCaptureScreen from '../components/onboarding-results/EmailCaptureScreen.jsx';
import MatchPlanScreen from '../components/onboarding-results/MatchPlanScreen.jsx';
import MatchScoreCard from '../components/onboarding-results/MatchScoreCard.jsx';
import NameCaptureScreen from '../components/onboarding-results/NameCaptureScreen.jsx';
import ScratchCardScreen from '../components/onboarding-results/ScratchCardScreen.jsx';
import { OnboardingResultsProvider } from '../context/OnboardingResultsContext.jsx';
import { useResultsFlow } from '../hooks/useResultsFlow.js';

function ResultsTopBar({ demo }) {
  return (
    <header className="onboarding-topbar">
      <span className="onboarding-topbar__side" />
      <span className="onboarding-wordmark"><BrandMark size={22} compact /> Dategram</span>
      <span className="onboarding-topbar__side onboarding-topbar__side--right">
        {demo ? <span className="demo-tag">PREVIEW</span> : null}
      </span>
    </header>
  );
}

function LoadingState() {
  return (
    <main className="onboarding-state">
      <div className="mini-logo-pulse"><BrandMark size={72} /></div>
      <h1>Loading your results</h1>
      <p>One moment...</p>
      <span className="state-loader" />
    </main>
  );
}

function ErrorState({ message, onRetry }) {
  return (
    <main className="onboarding-state">
      <div className="onboarding-state__error">!</div>
      <h1>We couldn’t load your results</h1>
      <p>{message}</p>
      <button type="button" className="onboarding-primary" onClick={onRetry}>TRY AGAIN</button>
    </main>
  );
}

export default function ResultsFlow({ user, onFinished }) {
  const [answers, setAnswers] = useState(null);

  // Only the local (demo) store needs the raw answers, because it runs the scoring maths in
  // the browser. For Telegram users every label is derived server-side from the stored
  // answers and arrives in the results payload, so the client never re-reads them.
  useEffect(() => {
    if (!user.isDemo) {
      setAnswers({});
      return undefined;
    }

    let cached = {};
    try {
      const raw = window.localStorage.getItem(`dategram:onboarding:v2:${user.telegramId}`);
      cached = raw ? JSON.parse(raw)?.answers || {} : {};
    } catch {
      cached = {};
    }
    setAnswers(cached);
    return undefined;
  }, [user.isDemo, user.telegramId]);

  const readAnswers = useCallback(() => answers || {}, [answers]);

  const flow = useResultsFlow({ user, readAnswers, onFinished });

  const contextValue = {
    results: flow.results,
    status: flow.status,
    error: flow.error,
    submitting: flow.submitting,
    step: flow.step,
  };

  let screen = null;
  if (flow.status === 'loading') {
    screen = <LoadingState />;
  } else if (flow.status === 'error') {
    screen = <ErrorState message={flow.error} onRetry={flow.retry} />;
  } else if (flow.step === 'analyzing') {
    screen = <AnalyzingScreen onReady={flow.begin} error={flow.error} onRetry={flow.begin} />;
  } else if (flow.results) {
    switch (flow.step) {
      case 'score':
        screen = (
          <MatchScoreCard
            results={flow.results}
            fallbackName={user.firstName}
            onContinue={() => flow.goTo('email')}
            submitting={flow.submitting}
          />
        );
        break;
      case 'email':
        screen = (
          <EmailCaptureScreen
            initialEmail={flow.results.email}
            onSubmit={flow.saveEmail}
            onSkip={() => flow.saveEmail(null)}
            submitting={flow.submitting}
            error={flow.error}
          />
        );
        break;
      case 'name':
        screen = (
          <NameCaptureScreen
            initialName={flow.results.name}
            onSubmit={flow.saveName}
            submitting={flow.submitting}
            error={flow.error}
          />
        );
        break;
      case 'plan':
        screen = (
          <MatchPlanScreen
            results={flow.results}
            fallbackName={user.firstName}
            onContinue={() => flow.goTo('discount')}
            submitting={flow.submitting}
          />
        );
        break;
      case 'discount':
        screen = (
          <ScratchCardScreen
            results={flow.results}
            onFetchPromo={flow.fetchPromo}
            onFinish={flow.finish}
            submitting={flow.submitting}
            error={flow.error}
          />
        );
        break;
      default:
        screen = <LoadingState />;
    }
  } else {
    screen = <LoadingState />;
  }

  return (
    <OnboardingResultsProvider value={contextValue}>
      <div className="onboarding-shell results-shell">
        {flow.status === 'ready' ? <ResultsTopBar demo={user.isDemo} /> : null}
        <div className="onboarding-stage" key={flow.step}>{screen}</div>
      </div>
    </OnboardingResultsProvider>
  );
}
