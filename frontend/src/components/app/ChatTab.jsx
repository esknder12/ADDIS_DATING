import { impact } from '../../lib/telegram.js';
import EmptyState from './EmptyState.jsx';
import { VerifiedBadge } from './icons.jsx';

function chatEmptyArt() {
  return (
    <svg viewBox="0 0 64 48" width="72" height="58" aria-hidden="true">
      <path d="M4 8a8 8 0 0 1 8-8h20a8 8 0 0 1 8 8v10a8 8 0 0 1-8 8H22l-9 7V8Z" fill="#FF2D55" fillOpacity="0.85" />
      <path d="M30 18a8 8 0 0 1 8-8h14a8 8 0 0 1 8 8v9a8 8 0 0 1-8 8h-8l-7 6V18Z" fill="#1f1f23" stroke="#29292D" />
      <circle cx="40" cy="22" r="2" fill="#9CA3AF" />
      <circle cx="46" cy="22" r="2" fill="#9CA3AF" />
      <circle cx="52" cy="22" r="2" fill="#9CA3AF" />
    </svg>
  );
}

export default function ChatTab({ matches, onOpenChat }) {
  return (
    <div className="tab-stage">
      <header className="tab-header">
        <h1>Chat</h1>
      </header>
      {matches.length === 0 ? (
        <EmptyState
          icon={chatEmptyArt()}
          heading="No chats yet"
          copy="Send reactions to get matches"
        />
      ) : (
        <ul className="match-list">
          {matches.map((match) => {
            const unread = match.lastMessage?.sender === 'profile';
            return (
              <li key={match.id}>
                <button
                  type="button"
                  className="match-row"
                  onClick={() => { impact('light'); onOpenChat(match); }}
                >
                  <img className="match-row__avatar" src={match.profile.photo} alt="" />
                  <span className="match-row__body">
                    <strong>{match.profile.name} {match.profile.verified && <VerifiedBadge />}</strong>
                    <small>{match.lastMessage ? match.lastMessage.body : 'Say hi to your new match 👋'}</small>
                  </span>
                  {unread && <span className="unread-dot" aria-label="Unread messages" />}
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
