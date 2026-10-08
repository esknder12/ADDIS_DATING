import { useCallback, useEffect, useRef, useState } from 'react';
import { impact, notify } from '../../lib/telegram.js';
import ScratchCard from './scratch/ScratchCard.jsx';
import ScratchCardContent from './scratch/ScratchCardContent.jsx';

const DWELL_MS = 1500;

export default function ScratchCardScreen({ results, onFetchPromo, onFinish, submitting, error }) {
  const [promo, setPromo] = useState(results.promo || null);
  const [finishing, setFinishing] = useState(false);
  const finishedRef = useRef(false);

  useEffect(() => {
    let cancelled = false;

    async function loadPromo() {
      if (promo) return;
      const loaded = await onFetchPromo();
      if (!cancelled && loaded) setPromo(loaded);
    }

    loadPromo();
    return () => { cancelled = true; };
  }, [onFetchPromo, promo]);

  const handleRevealComplete = useCallback(() => {
    if (finishedRef.current) return;
    finishedRef.current = true;
    notify('success');
    impact('heavy');
    setFinishing(true);

    // Let the discount be seen before the app transitions.
    window.setTimeout(async () => {
      const finished = await onFinish();
      if (!finished) {
        finishedRef.current = false;
        setFinishing(false);
      }
    }, DWELL_MS);
  }, [onFinish]);

  return (
    <main className="results-screen scratch-screen">
      <header className="results-header">
        <p className="eyebrow">ONE LAST THING</p>
        <h1>Scratch to reveal your special discount</h1>
        <p className="results-subtitle">We want you to start your journey with a nice surprise.</p>
      </header>

      {error ? <p className="onboarding-error" role="alert">{error}</p> : null}

      {promo ? (
        <ScratchCard threshold={0.6} onRevealComplete={handleRevealComplete}>
          <ScratchCardContent
            discountPercent={promo.discountPercent}
            promoCode={promo.code}
            expiresAt={promo.expiresAt}
          />
        </ScratchCard>
      ) : (
        <div className="scratch-loading" role="status">
          <span className="state-loader" />
          <p>Preparing your discount...</p>
        </div>
      )}

      {finishing ? (
        <p className="scratch-finishing" role="status">
          <span className="button-spinner" aria-hidden="true" />
          Setting up your account...
        </p>
      ) : (
        <p className="plan-footnote">Your discount is saved to your account and applied at checkout.</p>
      )}
    </main>
  );
}
