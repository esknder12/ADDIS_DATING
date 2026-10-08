import { useEffect, useMemo, useRef, useState } from 'react';
import { onboardingSections } from '@dategram/shared/onboarding';

const ROW_STEP_MS = 800;
const BADGE_STEP_MS = 2000;
const BADGES = [
  '📱 Telegram Mini App of the Year 2025',
  '📱 Top-10 Dating Apps, Google Play 2026',
];

const ROWS = [...onboardingSections.map((section) => section.label), 'Match Potential'];

export default function AnalyzingScreen({ onReady, error, onRetry }) {
  const [completedRows, setCompletedRows] = useState(0);
  const [badgeIndex, setBadgeIndex] = useState(0);
  const startedAt = useRef(0);

  // The animation must finish even when the API answers instantly, and must not hold the user
  // hostage when the API is slow: the transition waits for whichever finishes last.
  useEffect(() => {
    startedAt.current = Date.now();
    const rowTimer = window.setInterval(() => {
      setCompletedRows((count) => {
        if (count >= ROWS.length) {
          window.clearInterval(rowTimer);
          return count;
        }
        return count + 1;
      });
    }, ROW_STEP_MS);

    const badgeTimer = window.setInterval(
      () => setBadgeIndex((index) => (index + 1) % BADGES.length),
      BADGE_STEP_MS,
    );

    return () => {
      window.clearInterval(rowTimer);
      window.clearInterval(badgeTimer);
    };
  }, []);

  useEffect(() => {
    if (completedRows < ROWS.length) return undefined;

    const elapsed = Date.now() - startedAt.current;
    const remaining = Math.max(0, ROWS.length * ROW_STEP_MS + 400 - elapsed);
    const timer = window.setTimeout(onReady, remaining);
    return () => window.clearTimeout(timer);
  }, [completedRows, onReady]);

  const progress = useMemo(
    () => Math.round((completedRows / ROWS.length) * 100),
    [completedRows],
  );

  return (
    <main className="results-screen analyzing-screen">
      <header className="results-header">
        <p className="eyebrow">MATCH ANALYSIS</p>
        <h1>Analyzing your answers...</h1>
        <p className="results-subtitle">Building your profile from 31 answers across 5 sections.</p>
      </header>

      <ol className="analysis-rows">
        {ROWS.map((label, index) => {
          const state = index < completedRows ? 'done' : index === completedRows ? 'active' : 'idle';
          return (
            <li key={label} className={`analysis-row is-${state}`}>
              <span className="analysis-row__label">{label}</span>
              <span className="analysis-row__track"><span className="analysis-row__fill" /></span>
              <span className="analysis-row__check" aria-hidden="true">✓</span>
            </li>
          );
        })}
      </ol>

      <p className="sr-only" role="status" aria-live="polite">
        {`Analyzing: ${completedRows} of ${ROWS.length} sections complete.`}
      </p>

      {error ? (
        <div className="onboarding-error" role="alert">
          <p>{error}</p>
          <button type="button" className="onboarding-primary" onClick={onRetry}>TRY AGAIN</button>
        </div>
      ) : null}

      <footer className="analyzing-footer">
        <span className="trust-badge" key={badgeIndex}>{BADGES[badgeIndex]}</span>
      </footer>
    </main>
  );
}

export { ROWS as ANALYSIS_ROWS };
