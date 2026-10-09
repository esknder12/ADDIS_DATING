import { useCallback, useRef, useState } from 'react';
import { ArrowUpIcon, VerifiedBadge } from './icons.jsx';

const SWIPE_THRESHOLD = 90;

function flyAway(direction) {
  const x = direction === 'right'
    ? window.innerWidth * 1.4
    : direction === 'left' ? -window.innerWidth * 1.4 : 0;
  const y = direction === 'up' ? -window.innerHeight * 1.4 : 40;
  const rotation = direction === 'right' ? 24 : direction === 'left' ? -24 : 0;
  return {
    transform: `translate(${x}px, ${y}px) rotate(${rotation}deg)`,
    transition: 'transform 320ms ease-in',
  };
}

export default function SwipeCard({ member, interactive = true, onSwipe, onExpand }) {
  const cardRef = useRef(null);
  const dragRef = useRef(null);
  const [frame, setFrame] = useState({ transform: '', transition: '' });
  const [stamp, setStamp] = useState(null);

  const settle = useCallback((direction) => {
    setFrame(flyAway(direction));
    window.setTimeout(() => onSwipe?.(direction), 240);
  }, [onSwipe]);

  const handlePointerDown = useCallback((event) => {
    if (!interactive || event.button > 0) return;
    if (event.target.closest('button')) return;
    dragRef.current = { startX: event.clientX, startY: event.clientY, dx: 0, dy: 0 };
    cardRef.current?.setPointerCapture?.(event.pointerId);
  }, [interactive]);

  const handlePointerMove = useCallback((event) => {
    const drag = dragRef.current;
    if (!drag) return;
    drag.dx = event.clientX - drag.startX;
    drag.dy = event.clientY - drag.startY;
    const rotate = Math.max(-16, Math.min(16, drag.dx / 14));
    setFrame({
      transform: `translate(${drag.dx}px, ${drag.dy * 0.4}px) rotate(${rotate}deg)`,
      transition: 'none',
    });
    const isUpward = drag.dy < -26 && Math.abs(drag.dy) > Math.abs(drag.dx) * 1.15;
    setStamp(isUpward ? 'super' : Math.abs(drag.dx) > 26 ? (drag.dx > 0 ? 'like' : 'pass') : null);
  }, []);

  const handlePointerUp = useCallback(() => {
    const drag = dragRef.current;
    dragRef.current = null;
    if (!drag) return;
    const upwardSwipe = drag.dy <= -SWIPE_THRESHOLD
      && Math.abs(drag.dy) > Math.abs(drag.dx) * 1.05;
    if (upwardSwipe) {
      settle('up');
    } else if (Math.abs(drag.dx) >= SWIPE_THRESHOLD) {
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

      {member.compatibilityScore != null && Number.isFinite(Number(member.compatibilityScore)) && (
        <span className="swipe-card__compatibility">
          {Number(member.compatibilityScore)}% Match
        </span>
      )}

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

      {stamp && (
        <span className={`swipe-stamp swipe-stamp--${stamp}`}>
          {stamp === 'like' ? 'LIKE' : stamp === 'super' ? 'SUPER LIKE' : 'NOPE'}
        </span>
      )}

      <div className="swipe-card__scrim" aria-hidden="true" />
      <div className="swipe-card__info">
        <h3>
          {member.name} <span className="ribbon" aria-hidden="true">{member.emoji}</span> {member.age}
          {member.verified && <VerifiedBadge />}
        </h3>
        <p className="swipe-card__location">
          {[member.city, member.country].filter(Boolean).join(', ')}
          {member.distanceKm != null && ` · ${member.distanceKm} km away`}
        </p>
        <p className="swipe-card__bio">{member.bio}</p>
      </div>
    </article>
  );
}
