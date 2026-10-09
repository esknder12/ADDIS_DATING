import { useEffect, useState } from 'react';
import { authenticateUser } from '../api/client.js';
import BrandMark from '../components/BrandMark.jsx';
import { getTelegramUser, isTelegramMiniApp, notify } from '../lib/telegram.js';

const minimumSplashTime = 900;

function demoUser() {
  const telegramUser = getTelegramUser();
  return {
    id: 'preview-user',
    telegramId: String(telegramUser?.id || 1791462784),
    firstName: telegramUser?.first_name || 'Esknder',
    lastName: telegramUser?.last_name || 'Zinabie',
    username: telegramUser?.username || 'dategram_preview',
    photoUrl: telegramUser?.photo_url || null,
    onboardingCompleted: false,
    isVerified: false,
    isVip: false,
    isDemo: true,
  };
}

export default function Splash({ onAuthenticated }) {
  const [error, setError] = useState(null);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let cancelled = false;

    async function authenticate() {
      const startedAt = Date.now();
      setError(null);

      try {
        let user;
        const demoEnabled = import.meta.env.DEV
          || import.meta.env.VITE_ENABLE_DEMO_MODE !== 'false';

        if (!isTelegramMiniApp()) {
          if (!demoEnabled) {
            throw new Error('Open Dategram from Telegram to continue.');
          }
          user = demoUser();
        } else {
          const result = await authenticateUser();
          if (!result.success || !result.user) throw new Error('Authentication failed.');
          user = { ...result.user, isDemo: false };
        }

        const remaining = Math.max(0, minimumSplashTime - (Date.now() - startedAt));
        await new Promise((resolve) => window.setTimeout(resolve, remaining));
        if (!cancelled) {
          notify('success');
          onAuthenticated(user);
        }
      } catch (requestError) {
        if (cancelled) return;
        const message = requestError.response?.data?.error?.message
          || requestError.message
          || 'We could not connect to Dategram. Please try again.';
        setError(message);
      }
    }

    authenticate();
    return () => { cancelled = true; };
  }, [attempt, onAuthenticated]);

  if (error) {
    return (
      <main className="splash-screen splash-screen--error">
        <div className="splash-error" role="alert">
          <div className="error-icon">
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path d="M12 7.5v5.2M12 16.5h.01" />
              <circle cx="12" cy="12" r="9" />
            </svg>
          </div>
          <p className="eyebrow">CONNECTION PAUSED</p>
          <h1>Something went wrong</h1>
          <p className="splash-error__message">{error}</p>
          <button className="primary-button" type="button" onClick={() => setAttempt((value) => value + 1)}>
            TRY AGAIN
          </button>
        </div>
        <p className="bot-handle">@DategramAppBot</p>
      </main>
    );
  }

  return (
    <main className="splash-screen" aria-live="polite" aria-busy="true">
      <div className="splash-aura" aria-hidden="true" />
      <div className="splash-content">
        <div className="logo-pulse">
          <BrandMark size={94} />
        </div>
        <h1 className="splash-title">Dategram</h1>
        <p className="splash-tagline">Dating with intention.</p>
        <div className="loading-dots" aria-label="Loading Dategram">
          <span />
          <span />
          <span />
        </div>
      </div>
      <p className="bot-handle">@DategramAppBot</p>
    </main>
  );
}
