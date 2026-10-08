import { useCallback, useEffect, useState } from 'react';
import { initTelegramApp } from './lib/telegram.js';
import AuthenticatedHome from './pages/AuthenticatedHome.jsx';
import OnboardingFlow from './pages/OnboardingFlow.jsx';
import ResultsFlow from './pages/ResultsFlow.jsx';
import Splash from './pages/Splash.jsx';

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

  // Phase 3 hands back the updated user so the shell transition needs no reload.
  const handleResultsFinished = useCallback((finishedUser) => {
    setUser((current) => ({ ...current, ...finishedUser, resultsCompleted: true }));
  }, []);

  if (!initialized || !user) {
    return <Splash onAuthenticated={handleAuthenticated} />;
  }

  if (!user.onboardingCompleted) {
    return <OnboardingFlow user={user} />;
  }

  if (!user.resultsCompleted) {
    return <ResultsFlow user={user} onFinished={handleResultsFinished} />;
  }

  return <AuthenticatedHome user={user} />;
}
