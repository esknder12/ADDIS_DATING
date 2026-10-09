import { useCallback, useEffect, useMemo, useState } from 'react';
import { impact, notify } from '../../lib/telegram.js';
import { CloseIcon, PlainHeartIcon, StarIcon } from './icons.jsx';
import SwipeCard from './SwipeCard.jsx';

const MIN_LOADING_DURATION_MS = 2_500;
const STEP_DURATION_MS = 800;
const curationSteps = [
  { key: 'analyzing', icon: '🎙', label: 'Analyzing your preferences' },
  { key: 'searching', icon: '🔍', label: 'Searching for suitable candidates' },
  { key: 'preparing', icon: '👤', label: 'Preparing a personal selection' },
];

const reducedMotion = typeof window !== 'undefined'
  && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

function delay(milliseconds) {
  return new Promise((resolve) => window.setTimeout(resolve, milliseconds));
}

export default function AiPicksTab({
  loadPicks,
  onSwipe,
  onMatch,
  onOpenProfile,
  swipedProfileIds = new Set(),
}) {
  const [phase, setPhase] = useState('loading');
  const [attempt, setAttempt] = useState(0);
  const [completedSteps, setCompletedSteps] = useState(0);
  const [picks, setPicks] = useState([]);
  const [dailyLimit, setDailyLimit] = useState(5);
  const [picksShown, setPicksShown] = useState(0);
  const [isVip, setIsVip] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const timers = [];
    setPhase('loading');
    setCompletedSteps(0);
    setError('');

    const stepDuration = reducedMotion ? 500 : STEP_DURATION_MS;
    curationSteps.forEach((_, index) => {
      timers.push(window.setTimeout(() => {
        if (!cancelled) setCompletedSteps(index + 1);
      }, stepDuration * (index + 1)));
    });

    const request = Promise.resolve()
      .then(() => loadPicks())
      .then((data) => ({ data }))
      .catch((requestError) => ({ requestError }));

    Promise.all([request, delay(MIN_LOADING_DURATION_MS)]).then(([result]) => {
      if (cancelled) return;
      if (result.requestError) {
        console.error('Failed to load AI picks:', result.requestError);
        setError(result.requestError?.response?.data?.error?.message || 'We could not prepare your AI Picks.');
        setPhase('error');
        return;
      }
      const data = result.data || {};
      setPicks(Array.isArray(data.picks) ? data.picks : []);
      setDailyLimit(Number(data.dailyLimit) || 5);
      setPicksShown(Number(data.picksShown) || 0);
      setIsVip(Boolean(data.isVip));
      setPhase('ready');
    });

    return () => {
      cancelled = true;
      timers.forEach((timer) => window.clearTimeout(timer));
    };
  }, [attempt, loadPicks]);

  const visiblePicks = useMemo(
    () => picks.filter((profile) => !swipedProfileIds.has(String(profile.id))),
    [picks, swipedProfileIds],
  );
  const top = visiblePicks[0];
  const next = visiblePicks[1];

  const act = useCallback(async (action) => {
    if (!top || busy) return;
    setBusy(true);
    impact(action === 'pass' ? 'light' : 'medium');
    try {
      const outcome = await onSwipe(top.id, action);
      if (outcome?.error) {
        setError('That swipe did not save. Please try again.');
        return;
      }
      setError('');
      if (outcome?.matched) {
        notify('success');
        onMatch(outcome.profile || top);
      }
      setPicksShown((count) => count + 1);
      setPicks((current) => current.filter((profile) => String(profile.id) !== String(top.id)));
    } catch (swipeError) {
      console.error('AI Pick swipe failed:', swipeError);
      setError(swipeError?.response?.data?.error?.message || 'That swipe did not save. Please try again.');
    } finally {
      setBusy(false);
    }
  }, [busy, onMatch, onSwipe, top]);

  if (phase === 'loading') {
    return (
      <div className="tab-stage picks-curation" aria-live="polite" aria-busy="true">
        <div className="picks-curation__sparkle" aria-hidden="true">✦</div>
        <p className="picks-curation__wait">Please wait</p>
        <ol className="picks-curation__steps">
          {curationSteps.map((step, index) => {
            const complete = index < completedSteps;
            const active = index === completedSteps;
            return (
              <li key={step.key} className={complete ? 'done' : active ? 'active' : ''}>
                <span className="picks-step__indicator" aria-hidden="true">
                  {complete ? '✓' : step.icon}
                </span>
                <span>{step.label}{active ? '…' : ''}</span>
              </li>
            );
          })}
        </ol>
      </div>
    );
  }

  if (phase === 'error') {
    return (
      <div className="tab-stage">
        <div className="empty-state">
          <div className="empty-state__icon" aria-hidden="true">✨</div>
          <h2>AI Picks are taking a little longer</h2>
          <p>{error}</p>
          <button type="button" className="onboarding-primary" onClick={() => setAttempt((value) => value + 1)}>
            TRY AGAIN
          </button>
        </div>
      </div>
    );
  }

  if (!top) {
    return (
      <div className="tab-stage">
        <div className="empty-state ai-picks-empty">
          <div className="empty-state__icon" aria-hidden="true">✨</div>
          <h2>{picksShown > 0 ? 'You’ve seen today’s picks' : 'No picks available today'}</h2>
          <p>{picksShown > 0
            ? `We’ll prepare up to ${dailyLimit} new handpicked profiles for you tomorrow.`
            : 'We could not find enough eligible profiles for your selection just yet.'}</p>
          <p className="ai-picks-empty__note">Check the Discover tab in the meantime.</p>
          {isVip && <span className="vip-tag">VIP</span>}
        </div>
      </div>
    );
  }

  return (
    <div className="tab-stage discover-stage ai-picks-stage">
      <header className="discover-top">
        <span className="discover-top__brand">AI Picks</span>
        <span className="ai-picks-counter" aria-live="polite">
          {visiblePicks.length} of {dailyLimit} left{isVip ? ' · VIP' : ''}
        </span>
      </header>
      {error && <p className="ai-picks-error" role="alert">{error}</p>}

      <div className="deck">
        {next && <SwipeCard key={next.id} member={next} interactive={false} />}
        <SwipeCard
          key={top.id}
          member={top}
          interactive={!busy}
          onSwipe={(direction) => act(
            direction === 'right' ? 'like' : direction === 'up' ? 'super_like' : 'pass',
          )}
          onExpand={onOpenProfile}
        />
      </div>

      <div className="swipe-actions" role="group" aria-label="AI Pick actions">
        <button type="button" className="swipe-action swipe-action--pass" aria-label={`Pass ${top.name}`} onClick={() => act('pass')} disabled={busy}>
          <CloseIcon />
        </button>
        <button type="button" className="swipe-action swipe-action--super" aria-label={`Super like ${top.name}`} onClick={() => act('super_like')} disabled={busy}>
          <StarIcon />
        </button>
        <button type="button" className="swipe-action swipe-action--like" aria-label={`Like ${top.name}`} onClick={() => act('like')} disabled={busy}>
          <PlainHeartIcon />
        </button>
      </div>
    </div>
  );
}
