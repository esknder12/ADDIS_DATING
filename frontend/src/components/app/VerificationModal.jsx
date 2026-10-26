import { useCallback, useState } from 'react';
import { closeMiniApp, notify, openTelegramLink } from '../../lib/telegram.js';
import { CloseIcon, VerifiedBadge } from './icons.jsx';

const instructionLines = [
  'Press and hold the camera button in the bottom right corner.',
  'Smile at the camera and slowly turn your head to the side — 10 seconds max.',
  'If you see a microphone icon, tap it once to switch to the camera.',
];

/** Verification modal: one tap sends the steps to the user's bot chat and
 *  closes LibMatch itself — no stacked screens, no manual X. */
export default function VerificationModal({ user, photoUrl, status, onRequest, onStartChat, onClose, isDemo, botUsername }) {
  const [busy, setBusy] = useState(false);
  const [requested, setRequested] = useState(status === 'pending');
  const [chatFallback, setChatFallback] = useState(false);
  const botHandle = botUsername || 'addisdatingtest_Bot';

  const goToBotChat = useCallback(async () => {
    if (isDemo) {
      setChatFallback(true);
      return;
    }
    const outcome = await onStartChat();
    if (outcome?.sent) {
      notify('success');
      closeMiniApp();
      return;
    }
    setChatFallback(true);
  }, [isDemo, onStartChat]);

  const handleVerify = useCallback(async () => {
    if (busy) return;
    setBusy(true);
    try {
      await onRequest();
      setRequested(true);
      notify('success');
      await goToBotChat();
    } finally {
      setBusy(false);
    }
  }, [busy, goToBotChat, onRequest]);

  const continueInChat = useCallback(async () => {
    if (busy) return;
    setBusy(true);
    try {
      await goToBotChat();
    } finally {
      setBusy(false);
    }
  }, [busy, goToBotChat]);

  const verified = status === 'verified';
  const pending = requested || status === 'pending';

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

        {verified ? (
          <>
            <h2 id="verify-heading">You&apos;re verified</h2>
            <p className="verification-modal__copy">
              The badge is on your profile. People can trust it&apos;s really you.
            </p>
            <button type="button" className="onboarding-primary verification-modal__cta" onClick={onClose}>
              Done
            </button>
          </>
        ) : (
          <>
            <h2 id="verify-heading">Get your verification badge</h2>
            <p className="verification-modal__copy">
              Verification helps build a safer, more trusting community. A badge helps people trust your profile
            </p>

            <span className="verification-modal__pill">💬 Video selfie</span>

            {pending && !chatFallback ? (
              <div className="verification-modal__pending">
                <p><strong>Continue in the bot chat ✅</strong></p>
                <p className="verification-modal__waiting">
                  {isDemo
                    ? 'Preview mode: in Telegram the steps would already be waiting in your bot chat.'
                    : 'The steps are waiting in your bot chat — one tap takes you there.'}
                </p>
                {!isDemo && (
                  <button type="button" className="onboarding-primary verification-modal__cta" disabled={busy} onClick={continueInChat}>
                    {busy ? 'OPENING…' : 'Continue in bot chat'}
                  </button>
                )}
              </div>
            ) : (chatFallback || pending) ? (
              <div className="verification-modal__pending">
                <p><strong>One step away from the checkmark ✅</strong></p>
                <ol>
                  {instructionLines.map((line, index) => (
                    <li key={line}><span>{String(index + 1) + '\uFE0F\u20E3'}</span> {line}</li>
                  ))}
                </ol>
                <p className="verification-modal__waiting">
                  {isDemo
                    ? 'Preview mode: your badge is pending until a moderator approves the video note in Telegram.'
                    : `Couldn't reach your bot chat automatically — open @${botHandle} and send your video note there.`}
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
            {(pending || chatFallback) && (
              <button type="button" className="secondary-link" onClick={onClose}>Back to LibMatch</button>
            )}
          </>
        )}
      </div>
    </div>
  );
}
