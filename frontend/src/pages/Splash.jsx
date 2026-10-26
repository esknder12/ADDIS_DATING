import { useEffect, useState } from 'react';
import { authenticateUser, getApiBaseUrl, wakeServer } from '../api/client.js';
import BrandMark from '../components/BrandMark.jsx';
import { loadAppState, ONBOARDING_STORAGE_PREFIX } from '../lib/demoStore.js';
import { getTelegramUser, isTelegramMiniApp, notify } from '../lib/telegram.js';

const minimumSplashTime = 900;
const buildId = import.meta.env.VITE_BUILD_ID || 'manual-local';

function demoOnboardingCompleted(telegramId) {
  try {
    const raw = window.localStorage.getItem(`${ONBOARDING_STORAGE_PREFIX}:${telegramId}`);
    return Boolean(raw && JSON.parse(raw)?.completed);
  } catch {
    return false;
  }
}

function demoUser() {
  const telegramUser = getTelegramUser();
  const telegramId = String(telegramUser?.id || 1791462784);
  const appState = loadAppState(telegramId);
  return {
    id: 'preview-user',
    telegramId,
    firstName: telegramUser?.first_name || 'Esknder',
    lastName: telegramUser?.last_name || 'Zinabie',
    username: telegramUser?.username || 'libmatch_preview',
    photoUrl: telegramUser?.photo_url || null,
    onboardingCompleted: appState.conversionCompleted || demoOnboardingCompleted(telegramId),
    conversionCompleted: appState.conversionCompleted,
    isVerified: appState.verificationStatus === 'verified',
    isVip: appState.isVip,
    verificationStatus: appState.verificationStatus,
    name: appState.name,
    email: appState.email,
    results: appState.results,
    promoCode: appState.promoCode,
    discountPercent: appState.discountPercent,
    isDemo: true,
  };
}

export default function Splash({ onAuthenticated }) {
  const [error, setError] = useState(null);
  const [attempt, setAttempt] = useState(0);
  const [waking, setWaking] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const wakeTimer = window.setTimeout(() => { if (!cancelled) setWaking(true); }, 8000);

    async function authenticate() {
      const startedAt = Date.now();
      setError(null);
      setWaking(false);

      try {
        let user;
        const demoEnabled = import.meta.env.DEV
          || import.meta.env.VITE_ENABLE_DEMO_MODE !== 'false';

        if (!isTelegramMiniApp()) {
          if (!demoEnabled) {
            throw new Error('Open LibMatch from Telegram to continue.');
          }
          user = demoUser();
        } else {
          // Free-tier Render sleeps when idle; the wake ping absorbs the
          // 30-60s cold start so auth below never sees a false timeout.
          const health = await wakeServer();
          const result = await authenticateUser();
          if (!result.success || !result.user) throw new Error('Authentication failed.');
          user = { ...result.user, isDemo: false, botUsername: health?.botUsername || null };
        }

        const remaining = Math.max(0, minimumSplashTime - (Date.now() - startedAt));
        await new Promise((resolve) => window.setTimeout(resolve, remaining));
        if (!cancelled) {
          notify('success');
          onAuthenticated(user);
        }
      } catch (requestError) {
        if (cancelled) return;
        const noResponse = !requestError.response
          || requestError.code === 'ECONNABORTED'
          || requestError.code === 'ERR_NETWORK';
        const message = requestError.response?.data?.error?.message
          || (noResponse
            ? 'The LibMatch server is waking up. Wait a few seconds, then tap TRY AGAIN.'
            : requestError.message)
          || 'We could not connect to LibMatch. Please try again.';
        setError(message);
      }
    }

    authenticate();
    return () => { cancelled = true; window.clearTimeout(wakeTimer); };
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
        <p className="bot-handle">@addisdatingtest_Bot</p>
        <p className="build-stamp">build {buildId} · api {getApiBaseUrl() || 'same-host'}</p>
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
        <h1 className="splash-title">LibMatch</h1>
        <p className="splash-tagline">Dating with intention.</p>
        <div className="loading-dots" aria-label="Loading LibMatch">
          <span />
          <span />
          <span />
        </div>
        {waking && (
          <p className="splash-wake">Waking up LibMatch… first open can take up to a minute.</p>
        )}
      </div>
      <p className="bot-handle">@addisdatingtest_Bot</p>
    </main>
  );
}
