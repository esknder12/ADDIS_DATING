import { useCallback, useRef, useState } from 'react';
import { impact } from '../../lib/telegram.js';
import { ArrowUpIcon, VerifiedBadge } from './icons.jsx';

const SWIPE_THRESHOLD = 90;

function flyAway(direction) {
  const x = direction === 'right' ? window.innerWidth * 1.4 : -window.innerWidth * 1.4;
  return { transform: `translate(${x}px, 40px) rotate(${direction === 'right' ? 24 : -24}deg)`, transition: 'transform 320ms ease-in' };
}

export default function SwipeCard({ member, interactive = true, onSwipe, onExpand }) {
  const cardRef = useRef(null);
  const dragRef = useRef(null);
  const [frame, setFrame] = useState({ transform: '', transition: '' });
  const [stamp, setStamp] = useState(null);

  const settle = useCallback((direction) => {
    setFrame(flyAway(direction));
    impact(direction === 'right' ? 'medium' : 'light');
    window.setTimeout(() => onSwipe?.(direction), 240);
  }, [onSwipe]);

  const handlePointerDown = useCallback((event) => {
    if (!interactive || event.button > 0) return;
    if (event.target.closest('button')) return;
    dragRef.current = { startX: event.clientX, startY: event.clientY, dx: 0 };
    cardRef.current?.setPointerCapture?.(event.pointerId);
  }, [interactive]);

  const handlePointerMove = useCallback((event) => {
    const drag = dragRef.current;
    if (!drag) return;
    drag.dx = event.clientX - drag.startX;
    const dy = event.clientY - drag.startY;
    const rotate = Math.max(-16, Math.min(16, drag.dx / 14));
    setFrame({ transform: `translate(${drag.dx}px, ${dy * 0.4}px) rotate(${rotate}deg)`, transition: 'none' });
    setStamp(Math.abs(drag.dx) > 26 ? (drag.dx > 0 ? 'like' : 'pass') : null);
  }, []);

  const handlePointerUp = useCallback(() => {
    const drag = dragRef.current;
    dragRef.current = null;
    if (!drag) return;
    if (Math.abs(drag.dx) >= SWIPE_THRESHOLD) {
      settle(drag.dx > 0 ? 'right' : 'left');
    } else {
      setFrame({ transform: '', transition: 'transform 240ms cubic-bezier(.2,.9,.3,1.2)' });
      setStamp(null);
    }
  }, [settle]);

  return (
    <article
      ref={cardRef}
      className="swipe-card"
      style={frame}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerUp}
      aria-label={`${member.name}, ${member.age}`}
    >
      <img className="swipe-card__photo" src={member.photo} alt={`${member.name}`} draggable="false" />

      {interactive && (
        <button
          type="button"
          className="swipe-card__expand"
          aria-label={`View ${member.name}'s full profile`}
          onPointerDown={(event) => event.stopPropagation()}
          onClick={() => onExpand?.(member)}
        >
          <ArrowUpIcon />
        </button>
      )}

      {stamp && <span className={`swipe-stamp swipe-stamp--${stamp}`}>{stamp === 'like' ? 'LIKE' : 'NOPE'}</span>}

      <div className="swipe-card__scrim" aria-hidden="true" />
      <div className="swipe-card__info">
        <h3>
          {member.name} <span className="ribbon" aria-hidden="true">{member.emoji}</span> {member.age}
          {member.verified && <VerifiedBadge />}
        </h3>
        <p className="swipe-card__location">{member.city}, {member.country} · {member.distanceKm} km away</p>
        <p className="swipe-card__bio">{member.bio}</p>
      </div>
    </article>
  );
}
