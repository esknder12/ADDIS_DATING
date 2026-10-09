import { useState } from 'react';
import { impact } from '../../lib/telegram.js';
import EmptyState from './EmptyState.jsx';
import { VerifiedBadge } from './icons.jsx';

function formatTime(iso) {
  if (!iso) return '';
  const date = new Date(iso);
  const now = new Date();
  const sameDay = date.toDateString() === now.toDateString();
  return sameDay
    ? date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    : date.toLocaleDateString([], { month: 'short', day: 'numeric' });
}

export default function LikesTab({ likedYou, matches, isVip, onOpenProfile, onOpenChat, onShowPaywall }) {
  const [segment, setSegment] = useState('liked');

  return (
    <div className="tab-stage">
      <header className="tab-header">
        <h1>Likes</h1>
        <div className="segmented" role="tablist" aria-label="Likes and matches">
          <button
            type="button"
            role="tab"
            aria-selected={segment === 'liked'}
            className={segment === 'liked' ? 'active' : ''}
            onClick={() => { setSegment('liked'); impact('light'); }}
          >
            Liked you
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={segment === 'matches'}
            className={segment === 'matches' ? 'active' : ''}
            onClick={() => { setSegment('matches'); impact('light'); }}
          >
            Matches
          </button>
        </div>
      </header>

      {segment === 'liked' && (likedYou.length === 0 ? (
        <EmptyState
          icon={<ClockPersonIcon />}
          heading="Inbox reactions"
          copy="When someone will send a reaction on your profile we will notify you"
        />
      ) : (
        <>
          {!isVip && (
            <button type="button" className="unlock-banner" onClick={onShowPaywall}>
              <span aria-hidden="true">🔒</span>
              <span><strong>{likedYou.length} {likedYou.length === 1 ? 'person likes' : 'people like'} you</strong><small>Go VIP to see who and message them first</small></span>
            </button>
          )}
          <ul className="likes-grid">
            {likedYou.map((member) => (
              <li key={member.id}>
                <button
                  type="button"
                  className={`like-card${isVip ? '' : ' like-card--blurred'}`}
                  onClick={() => (isVip ? onOpenProfile(member) : onShowPaywall(member))}
                  aria-label={isVip ? `Open ${member.name}'s profile` : 'Hidden admirer — unlock with VIP'}
                >
                  <img src={member.photo} alt="" loading="lazy" aria-hidden={!isVip} />
                  {isVip && (
                    <div className="like-card__info">
                      <strong>{member.name} {member.age} {member.verified && <VerifiedBadge />}</strong>
                    </div>
                  )}
                  {!isVip && <span className="like-card__lock" aria-hidden="true">🔒</span>}
                </button>
              </li>
            ))}
          </ul>
        </>
      ))}

      {segment === 'matches' && (matches.length === 0 ? (
        <EmptyState
          icon={<ClockPersonIcon />}
          heading="Inbox reactions"
          copy="When someone will send a reaction on your profile we will notify you"
        />
      ) : (
        <ul className="match-list">
          {matches.map((match) => (
            <li key={match.id}>
              <button
                type="button"
                className="match-row"
                onClick={() => { impact('light'); onOpenChat(match); }}
              >
                <img className="match-row__avatar" src={match.profile.photo} alt="" />
                <span className="match-row__body">
                  <strong>{match.profile.name} {match.profile.verified && <VerifiedBadge />}</strong>
                  <small>{match.lastMessage ? match.lastMessage.body : `You matched with ${match.profile.name} — say hi 👋`}</small>
                </span>
                <time>{formatTime(match.lastMessage?.createdAt || match.createdAt)}</time>
              </button>
            </li>
          ))}
        </ul>
      ))}
    </div>
  );
}

function ClockPersonIcon() {
  return (
    <svg viewBox="0 0 48 48" width="64" height="64" fill="none" stroke="#6b7280" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="24" cy="24" r="19" />
      <path d="M24 14v10l7 4" />
    </svg>
  );
}
