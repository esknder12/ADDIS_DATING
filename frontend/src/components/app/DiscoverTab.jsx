import { useCallback, useMemo, useState } from 'react';
import { impact } from '../../lib/telegram.js';
import EmptyState from './EmptyState.jsx';
import SwipeCard from './SwipeCard.jsx';
import {
  BoltIcon,
  CloseIcon,
  PlainHeartIcon,
  RewindIcon,
  SendIcon,
  SlidersIcon,
  StarIcon,
} from './icons.jsx';

export default function DiscoverTab({
  discover,
  matches,
  onSwipe,
  onRewind,
  onOpenProfile,
  onMatch,
  onBoost,
  onDirectMessage,
  onOpenChat,
}) {
  const [filterOpen, setFilterOpen] = useState(false);
  const [intentionFilter, setIntentionFilter] = useState('all');
  const [busy, setBusy] = useState(false);

  const matchedIds = useMemo(() => new Set(matches.map((match) => match.profile.id)), [matches]);

  const visible = useMemo(() => (intentionFilter === 'all'
    ? discover
    : discover.filter((member) => member.intention === intentionFilter)), [discover, intentionFilter]);

  const top = visible[0];
  const next = visible[1];

  const act = useCallback(async (action) => {
    if (!top || busy) return;
    setBusy(true);
    impact(action === 'pass' ? 'light' : 'medium');
    try {
      const outcome = await onSwipe(top.id, action);
      if (outcome?.matched && outcome.profile) onMatch(outcome.profile);
    } catch (error) {
      console.error('Swipe failed:', error);
    } finally {
      setBusy(false);
    }
  }, [busy, onMatch, onSwipe, top]);

  const handleRewind = useCallback(async () => {
    impact('soft');
    await onRewind();
  }, [onRewind]);

  const handleDirectMessage = useCallback(() => {
    if (!top) return;
    if (matchedIds.has(top.id)) onOpenChat?.(top.id);
    else onDirectMessage?.(top);
  }, [matchedIds, onDirectMessage, onOpenChat, top]);

  if (!top) {
    return (
      <div className="tab-stage">
        <EmptyState
          icon={<CardsEmptyIcon />}
          heading="You’re all caught up"
          copy="New verified people join every day. Check back soon — or rewind your last card."
          action={<button type="button" className="onboarding-primary" onClick={handleRewind}>REWIND LAST CARD</button>}
        />
      </div>
    );
  }

  return (
    <div className="tab-stage discover-stage">
      <header className="discover-top">
        <button type="button" className="discover-top__control discover-top__control--boost" aria-label="Boost your profile" onClick={onBoost}>
          <BoltIcon />
        </button>
        <span className="discover-top__brand">Dategram</span>
        <button type="button" className="discover-top__control" aria-label="Discovery filters" onClick={() => setFilterOpen(true)}>
          <SlidersIcon />
        </button>
      </header>

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

      <div className="swipe-actions" role="group" aria-label="Card actions">
        <button type="button" className="swipe-action swipe-action--rewind" aria-label="Rewind" onClick={handleRewind} disabled={busy}>
          <RewindIcon />
        </button>
        <button type="button" className="swipe-action swipe-action--pass" aria-label={`Pass ${top.name}`} onClick={() => act('pass')} disabled={busy}>
          <CloseIcon />
        </button>
        <button type="button" className="swipe-action swipe-action--super" aria-label={`Super like ${top.name}`} onClick={() => act('super_like')} disabled={busy}>
          <StarIcon />
        </button>
        <button type="button" className="swipe-action swipe-action--like" aria-label={`Like ${top.name}`} onClick={() => act('like')} disabled={busy}>
          <PlainHeartIcon />
        </button>
        <button type="button" className="swipe-action swipe-action--message" aria-label="Send a direct message" onClick={handleDirectMessage} disabled={busy}>
          <SendIcon />
        </button>
      </div>

      {filterOpen && (
        <div className="sheet-backdrop" role="presentation" onClick={() => setFilterOpen(false)}>
          <div className="sheet" role="dialog" aria-modal="true" aria-label="Discovery filters" onClick={(event) => event.stopPropagation()}>
            <div className="sheet__grabber" aria-hidden="true" />
            <h2>Discovery filters</h2>
            <p className="sheet__label">INTENTION</p>
            <div className="chip-row">
              {['all', 'Serious relationship', 'Dating & seeing where it goes', 'Online communication'].map((intention) => (
                <button
                  key={intention}
                  type="button"
                  className={`chip${intentionFilter === intention ? ' chip--active' : ''}`}
                  onClick={() => { setIntentionFilter(intention); impact('light'); }}
                >
                  {intention === 'all' ? 'All' : intention}
                </button>
              ))}
            </div>
            <button type="button" className="onboarding-primary" onClick={() => setFilterOpen(false)}>APPLY</button>
          </div>
        </div>
      )}
    </div>
  );
}

function CardsEmptyIcon() {
  return (
    <svg viewBox="0 0 48 48" width="64" height="64" fill="none" stroke="#9CA3AF" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="14" y="8" width="22" height="28" rx="4" transform="rotate(5 25 22)" />
      <rect x="9" y="12" width="22" height="28" rx="4" transform="rotate(-4 20 26)" />
    </svg>
  );
}
