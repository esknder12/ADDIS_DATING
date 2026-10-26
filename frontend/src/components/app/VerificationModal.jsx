import { useCallback, useState } from 'react';
import { notify, openTelegramLink } from '../../lib/telegram.js';
import { CloseIcon, VerifiedBadge } from './icons.jsx';

const instructionLines = [
  'Press and hold the camera button in the bottom right corner.',
  'Smile at the camera and slowly turn your head to the side.',
  'If you see a microphone icon, tap it once to switch to the camera.',
];

/** V1 — in-app verification modal (spec section 5). */
export default function VerificationModal({ user, photoUrl, status, onRequest, onClose, isDemo, botUsername }) {
  const [busy, setBusy] = useState(false);
  const [requested, setRequested] = useState(status === 'pending');
  const botHandle = botUsername || 'DategramAppBot';

  const handleVerify = useCallback(async () => {
    if (busy) return;
    setBusy(true);
    try {
      await onRequest();
      setRequested(true);
      notify('success');
    } finally {
      setBusy(false);
    }
  }, [busy, isDemo, onRequest]);

  return (
    <div className="modal-backdrop" role="presentation" onClick={onClose}>
      <div className="verification-modal" role="dialog" aria-modal="true" aria-labelledby="verify-heading" onClick={(event) => event.stopPropagation()}>
        <button type="button" className="icon-button verification-modal__close" aria-label="Close" onClick={onClose}>
          <CloseIcon />
        </button>

        <div className="verification-modal__photo">
          <img src={photoUrl || '/images/onboarding-professional.jpg'} alt="" />
          <span className="verification-modal__badge"><VerifiedBadge size={26} /></span>
        </div>

        <h2 id="verify-heading">Get your verification badge</h2>
        <p className="verification-modal__copy">
          Verification helps build a safer, more trusting community. A badge helps people trust your profile
        </p>

        <span className="verification-modal__pill">💬 Video selfie</span>

        {requested || status === 'pending' ? (
          <div className="verification-modal__pending">
            <p><strong>One step away from the checkmark ✅</strong></p>
            <ol>
              {instructionLines.map((line, index) => (
                <li key={line}><span>{index + 1}️⃣</span> {line}</li>
              ))}
            </ol>
            <p className="verification-modal__waiting">
              {isDemo
                ? 'Preview mode: your badge is pending until a moderator approves the video note in Telegram.'
                : `Tap below to open @${botHandle}, then send your video note right there — it takes 10 seconds.`}
            </p>
            {!isDemo && (
              <button
                type="button"
                className="onboarding-primary verification-modal__cta"
                onClick={() => openTelegramLink(`https://t.me/${botHandle}?start=verify`)}
              >
                {`Open @${botHandle}`}
              </button>
            )}
          </div>
        ) : (
          <button type="button" className="onboarding-primary verification-modal__cta" disabled={busy} onClick={handleVerify}>
            {busy ? 'OPENING BOT…' : 'Get verified'}
          </button>
        )}
        {requested && !isDemo && (
          <button type="button" className="secondary-link" onClick={onClose}>Back to Dategram</button>
        )}
      </div>
    </div>
  );
}
