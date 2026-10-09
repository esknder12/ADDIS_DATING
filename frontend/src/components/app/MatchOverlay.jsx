import { useEffect } from 'react';
import { notify } from '../../lib/telegram.js';

export default function MatchOverlay({ profile, userPhotoUrl, onSendMessage, onKeepSwiping }) {
  useEffect(() => { notify('success'); }, []);

  return (
    <div className="match-overlay" role="dialog" aria-modal="true" aria-label="It's a match">
      <div className="match-overlay__burst" aria-hidden="true" />
      <h2>It’s a match! ✨</h2>
      <p>You and {profile.name} liked each other</p>
      <div className="match-overlay__photos">
        <img src={userPhotoUrl || '/images/onboarding-professional.jpg'} alt="You" />
        <span className="match-overlay__heart" aria-hidden="true">♥</span>
        <img src={profile.photo} alt={profile.name} />
      </div>
      <button type="button" className="onboarding-primary" onClick={() => onSendMessage(profile)}>
        SEND A MESSAGE
      </button>
      <button type="button" className="secondary-link" onClick={onKeepSwiping}>
        Keep swiping
      </button>
    </div>
  );
}
