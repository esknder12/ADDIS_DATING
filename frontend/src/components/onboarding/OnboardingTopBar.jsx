import { useEffect, useRef, useState } from 'react';
import BrandMark from '../BrandMark.jsx';

function MoreIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <circle cx="5" cy="12" r="1.6" />
      <circle cx="12" cy="12" r="1.6" />
      <circle cx="19" cy="12" r="1.6" />
    </svg>
  );
}

export default function OnboardingTopBar({
  canGoBack,
  onBack,
  saving,
  demo,
  onRestart,
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef(null);

  useEffect(() => {
    function closeMenu(event) {
      if (!menuRef.current?.contains(event.target)) setMenuOpen(false);
    }
    document.addEventListener('pointerdown', closeMenu);
    return () => document.removeEventListener('pointerdown', closeMenu);
  }, []);

  return (
    <header className="onboarding-topbar">
      <div className="onboarding-topbar__side">
        {canGoBack && (
          <button
            type="button"
            className="onboarding-back"
            onClick={onBack}
            disabled={saving}
            aria-label="Go to previous screen"
          >
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m14.5 5-7 7 7 7" /></svg>
          </button>
        )}
      </div>
      <div className="onboarding-wordmark">
        <BrandMark size={25} compact />
        <span>Dategram</span>
      </div>
      <div className="onboarding-topbar__side onboarding-topbar__side--right" ref={menuRef}>
        <button
          type="button"
          className="onboarding-more"
          aria-label="More options"
          aria-expanded={menuOpen}
          onClick={() => setMenuOpen((open) => !open)}
        >
          <MoreIcon />
        </button>
        {menuOpen && (
          <div className="onboarding-menu">
            <div className="onboarding-menu__brand">Dategram</div>
            {demo && (
              <button
                type="button"
                onClick={() => {
                  setMenuOpen(false);
                  onRestart();
                }}
              >
                Restart preview
              </button>
            )}
            <span>Dating with intention</span>
          </div>
        )}
      </div>
    </header>
  );
}
