import TopBar from '../components/TopBar.jsx';

function CheckIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="m6.5 12.4 3.4 3.4 7.7-8" />
    </svg>
  );
}

function ShieldIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M12 3.4 19 6v5.2c0 4.2-2.7 7.7-7 9.4-4.3-1.7-7-5.2-7-9.4V6l7-2.6Z" />
      <path d="m8.8 12 2.1 2.1 4.4-4.5" />
    </svg>
  );
}

function TelegramIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="m20.4 4.5-3 14.1c-.2 1-1 1.2-1.8.7l-4.6-3.4-2.2 2.2c-.3.3-.5.5-.9.5l.3-4.7 8.6-7.8c.4-.3-.1-.5-.6-.2L5.6 12.6 1 11.2c-1-.3-1-1 .2-1.5l18-6.9c.8-.3 1.5.2 1.2 1.7Z" />
    </svg>
  );
}

function initials(user) {
  return [user.firstName, user.lastName]
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part.charAt(0).toUpperCase())
    .join('') || 'D';
}

export default function AuthenticatedHome({ user }) {
  const displayName = user.firstName || user.name || 'there';

  return (
    <div className="app-shell">
      <TopBar demo={user.isDemo} />
      <main className="authenticated-home">
        <section className="welcome-block">
          <div className="avatar-wrap">
            {user.photoUrl ? (
              <img className="avatar" src={user.photoUrl} alt="" />
            ) : (
              <div className="avatar avatar--fallback">{initials(user)}</div>
            )}
            <span className="avatar-check"><CheckIcon /></span>
          </div>
          <p className="eyebrow">TELEGRAM CONNECTED</p>
          <h1>Welcome, {displayName}.</h1>
          <p className="welcome-copy">
            Your secure Dategram account is ready. Next, we’ll learn what matters to you.
          </p>
        </section>

        <section className="connection-card" aria-label="Account connection status">
          <div className="connection-card__glow" aria-hidden="true" />
          <div className="connection-row">
            <span className="connection-icon connection-icon--telegram"><TelegramIcon /></span>
            <div>
              <span className="connection-label">Telegram identity</span>
              <strong>{user.username ? `@${user.username}` : `ID ${user.telegramId}`}</strong>
            </div>
            <span className="status-pill"><CheckIcon /> Secure</span>
          </div>
          <div className="connection-divider" />
          <div className="connection-row">
            <span className="connection-icon"><ShieldIcon /></span>
            <div>
              <span className="connection-label">Profile status</span>
              <strong>{user.onboardingCompleted ? 'Ready to discover' : 'Setup not started'}</strong>
            </div>
            <span className="row-chevron" aria-hidden="true">›</span>
          </div>
        </section>

        <div className="trust-note">
          <ShieldIcon />
          <p><strong>Your privacy comes first.</strong> Telegram credentials never leave Telegram; Dategram only receives signed profile data.</p>
        </div>
      </main>
      <footer className="phase-footer">
        <span className="phase-dot" />
        Authentication complete
      </footer>
    </div>
  );
}
