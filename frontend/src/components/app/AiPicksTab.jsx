import { useEffect, useRef, useState } from 'react';
import { dailyAiPicks } from '@dategram/shared/catalog';
import { impact } from '../../lib/telegram.js';
import { VerifiedBadge } from './icons.jsx';

const curationSteps = [
  'Analyzing your preferences',
  'Searching for suitable candidates',
  'Preparing a personal selection',
];

const reducedMotion = typeof window !== 'undefined'
  && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

export default function AiPicksTab({ user, onOpenProfile }) {
  const [completedSteps, setCompletedSteps] = useState(0);
  const [ready, setReady] = useState(false);
  const picksRef = useRef(null);

  // Cache actual picks; the animation may replay on tab entry without
  // regenerating the selection (spec section 8).
  if (!picksRef.current) picksRef.current = dailyAiPicks(user.telegramId);

  useEffect(() => {
    if (ready) return undefined;
    const stepMs = reducedMotion ? 250 : 1400;
    const timers = curationSteps.map((_, index) => window.setTimeout(() => {
      setCompletedSteps(index + 1);
    }, stepMs * (index + 1)));
    timers.push(window.setTimeout(() => setReady(true), stepMs * (curationSteps.length + 0.6)));
    return () => timers.forEach((timer) => window.clearTimeout(timer));
  }, [ready]);

  if (!ready) {
    return (
      <div className="tab-stage picks-curation" aria-live="polite" aria-busy="true">
        <div className="picks-curation__sparkle" aria-hidden="true">✦</div>
        <p className="picks-curation__wait">Please wait</p>
        <ol className="picks-curation__steps">
          {curationSteps.map((label, index) => {
            const complete = index < completedSteps;
            const active = index === completedSteps;
            return (
              <li key={label} className={complete ? 'done' : active ? 'active' : ''}>
                <span className="picks-step__indicator" aria-hidden="true">{complete ? '✓' : ''}</span>
                <span>{label}{active && !reducedMotion ? '…' : ''}</span>
              </li>
            );
          })}
        </ol>
      </div>
    );
  }

  return (
    <div className="tab-stage">
      <header className="tab-header">
        <h1>AI Picks</h1>
        <p>Curated for you daily from your answers</p>
      </header>
      <ul className="picks-grid">
        {picksRef.current.map((member) => (
          <li key={member.id}>
            <button
              type="button"
              className="pick-card"
              onClick={() => { impact('light'); onOpenProfile(member); }}
              aria-label={`Open ${member.name}'s profile`}
            >
              <img src={member.photo} alt="" loading="lazy" />
              <div className="pick-card__scrim" aria-hidden="true" />
              <div className="pick-card__info">
                <strong>
                  {member.name} {member.age} {member.verified && <VerifiedBadge />}
                </strong>
                <span>{member.intention}</span>
              </div>
              <span className="pick-card__sparkle" aria-hidden="true">✦ AI pick</span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
