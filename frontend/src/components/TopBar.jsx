import BrandMark from './BrandMark.jsx';

function MoreIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <circle cx="5" cy="12" r="1.7" fill="currentColor" />
      <circle cx="12" cy="12" r="1.7" fill="currentColor" />
      <circle cx="19" cy="12" r="1.7" fill="currentColor" />
    </svg>
  );
}

export default function TopBar({ demo = false }) {
  return (
    <header className="top-bar">
      <div className="top-bar__brand">
        <BrandMark size={28} compact />
        <span>Dategram</span>
      </div>
      <div className="top-bar__actions">
        {demo && <span className="demo-badge">PREVIEW</span>}
        <button className="icon-button" type="button" aria-label="More options">
          <MoreIcon />
        </button>
      </div>
    </header>
  );
}
