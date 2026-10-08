import { useCallback, useEffect, useState } from 'react';
import { initTelegramApp } from './lib/telegram.js';
import AuthenticatedHome from './pages/AuthenticatedHome.jsx';
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

  if (!initialized || !user) {
    return <Splash onAuthenticated={handleAuthenticated} />;
  }

  return <AuthenticatedHome user={user} />;
}
