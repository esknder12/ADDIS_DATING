import { useCallback, useEffect, useState } from 'react';
import { useAppData } from './hooks/useAppData.js';
import { initTelegramApp } from './lib/telegram.js';
import MainApp from './pages/MainApp.jsx';
import OnboardingFlow from './pages/OnboardingFlow.jsx';
import ResultsFlow from './pages/ResultsFlow.jsx';
import Splash from './pages/Splash.jsx';

function initialStage(user) {
  if (!user.onboardingCompleted) return 'onboarding';
  if (!user.conversionCompleted) return 'results';
  return 'app';
}

function Session({ user }) {
  const appData = useAppData(user);
  const [stage, setStage] = useState(() => initialStage(user));

  if (stage === 'onboarding') {
    return <OnboardingFlow user={user} onFinished={() => setStage('results')} />;
  }

  if (stage === 'results') {
    return (
      <ResultsFlow
        user={user}
        appData={appData}
        onFinished={() => {
          appData.markConversionCompleted();
          setStage('app');
        }}
      />
    );
  }

  return <MainApp user={user} appData={appData} />;
}

export default function App() {
  const [initialized, setInitialized] = useState(false);
  const [user, setUser] = useState(null);

  useEffect(() => {
    initTelegramApp();
    setInitialized(true);
  }, []);

  const handleAuthenticated = useCallback((authenticatedUser) => {
    setUser(authenticatedUser);
  }, []);

  if (!initialized || !user) {
    return <Splash onAuthenticated={handleAuthenticated} />;
  }

  return <Session key={user.telegramId} user={user} />;
}
