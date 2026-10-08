import { useEffect, useRef, useState } from 'react';
import { closeMiniApp, impact, notify } from '../../lib/telegram.js';
import VerifiedBadge from './VerifiedBadge.jsx';

const FOCUSABLE = 'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])';

/**
 * V1 — the in-app verification modal.
 *
 * Tapping the CTA asks the API to send the bot sequence, then closes the Mini App so the user
 * lands in the bot chat where the instructions have already arrived.
 */
export default function VerificationModal({
  userPhotoUrl,
  displayName,
  isDemo = false,
  onRequest,
  onClose,
}) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const dialogRef = useRef(null);
  const previouslyFocused = useRef(null);

  useEffect(() => {
    previouslyFocused.current = document.activeElement;
    dialogRef.current?.querySelector('button')?.focus();

    function onKeyDown(event) {
      if (event.key === 'Escape') {
        event.preventDefault();
        onClose();
        return;
      }
      if (event.key !== 'Tab') return;

      const focusable = [...(dialogRef.current?.querySelectorAll(FOCUSABLE) || [])];
      if (focusable.length === 0) return;

      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }

    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      previouslyFocused.current?.focus?.();
    };
  }, [onClose]);

  async function handleGetVerified() {
    if (loading) return;
    setLoading(true);
    setError('');
    impact('medium');

    try {
      if (isDemo) {
        await onRequest?.();
        setLoading(false);
        return;
      }

      await onRequest?.();
      notify('success');
      // The bot messages are already sent; returning to the chat is the whole point.
      closeMiniApp();
    } catch (requestError) {
      // Re-enable the button and say why — a dead button with no message is worse than an error.
      setError(
        requestError.response?.data?.error?.message
          || requestError.message
          || 'We could not start verification. Please try again.',
      );
      setLoading(false);
    }
  }

  return (
    <div className="verification-overlay" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <div className="verification-modal" role="dialog" aria-modal="true" aria-labelledby="verification-title" ref={dialogRef}>
        <button type="button" className="verification-close" onClick={onClose} aria-label="Close">
          ✕
        </button>

        <div className="verification-modal__body">
          <div className="verification-avatar">
            {userPhotoUrl ? (
              <img src={userPhotoUrl} alt="" />
            ) : (
              <span className="verification-avatar__initials">
                {(displayName || 'D').charAt(0).toUpperCase()}
              </span>
            )}
            <span className="verification-avatar__badge"><VerifiedBadge size={22} label="Verified badge preview" /></span>
          </div>

          <h2 id="verification-title">Get your verification badge</h2>
          <p className="verification-copy">
            Verification helps build a safer, more trusting community. A badge helps people trust your profile
          </p>

          <span className="verification-pill"><span aria-hidden="true">💬</span> Video selfie</span>

          {isDemo ? (
            <p className="verification-note">
              Preview only — the video is recorded in the bot chat, so this flow needs Telegram.
            </p>
          ) : null}

          {error ? <p className="verification-error" role="alert">{error}</p> : null}

          <button
            type="button"
            className="verification-cta"
            onClick={handleGetVerified}
            disabled={loading}
          >
            {loading ? 'Opening chat...' : 'Get verified'}
          </button>
        </div>
      </div>
    </div>
  );
}
