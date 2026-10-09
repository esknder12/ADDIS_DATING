import { useEffect, useState } from 'react';

function remainingLabel(expiresAt, now) {
  if (!expiresAt) return '';
  const minutes = Math.max(0, Math.ceil((new Date(expiresAt).getTime() - now) / 60_000));
  return `${minutes} min left`;
}

export default function BoostBanner({ boost, busy = false, onActivate }) {
  const [now, setNow] = useState(Date.now());
  const [error, setError] = useState('');
  const isActive = Boolean(boost?.isActive && boost.boost?.expiresAt
    && new Date(boost.boost.expiresAt).getTime() > now);

  useEffect(() => {
    if (!isActive) return undefined;
    const timer = window.setInterval(() => setNow(Date.now()), 30_000);
    return () => window.clearInterval(timer);
  }, [isActive]);

  const activate = async () => {
    if (busy || isActive) return;
    setError('');
    try {
      await onActivate();
      setNow(Date.now());
    } catch (activationError) {
      setError(activationError?.response?.data?.error?.message || 'Could not activate your boost. Try again.');
    }
  };

  return (
    <section className={`boost-banner${isActive ? ' boost-banner--active' : ''}`} aria-label="Profile boost">
      <div className="boost-banner__copy">
        <span className="boost-banner__icon" aria-hidden="true">⚡</span>
        <span>
          <strong>{isActive ? 'Your profile is boosted' : 'Get seen by more people'}</strong>
          <small>{isActive ? remainingLabel(boost.boost.expiresAt, now) : 'Boost your profile for 30 minutes'}</small>
        </span>
      </div>
      <button type="button" onClick={activate} disabled={busy || isActive}>
        {isActive ? 'ACTIVE' : busy ? '…' : 'BOOST'}
      </button>
      {error && <p className="boost-banner__error" role="alert">{error}</p>}
    </section>
  );
}
