import { useState } from 'react';
import { requestVerification } from '../../api/verification.api.js';
import { useVerificationStatus, writeDemoStatus } from '../../hooks/useVerificationStatus.js';
import VerificationModal from './VerificationModal.jsx';
import VerifiedBadge from './VerifiedBadge.jsx';

const STATUS_COPY = {
  requested: {
    eyebrow: 'VERIFICATION STARTED',
    title: 'Open the bot chat and send your video',
    body: 'We sent the instructions to @DategramAppBot. Record a short round video there to finish.',
  },
  pending_review: {
    eyebrow: 'IN REVIEW',
    title: 'We’re reviewing your video',
    body: 'This usually takes a few minutes. Your badge appears here as soon as it’s approved.',
  },
  approved: {
    eyebrow: 'VERIFIED',
    title: 'You’re verified',
    body: 'Your profile now shows a verified badge to every member.',
  },
  rejected: {
    eyebrow: 'TRY AGAIN',
    title: 'We couldn’t verify that video',
    body: 'Make sure your face is clearly visible and well lit, then send a new round video.',
  },
  not_started: {
    eyebrow: 'BUILD TRUST',
    title: 'Get your verification badge',
    body: 'A short round video in the bot chat. Verified profiles get more matches.',
  },
};

/**
 * Host for V1. Built to be lifted into the Phase 5 Profile tab unchanged — it owns its own
 * state and polling, so it needs nothing from the surrounding screen but the user identity.
 */
export default function VerificationCard({ user }) {
  const [modalOpen, setModalOpen] = useState(false);
  const verification = useVerificationStatus({
    isDemo: user.isDemo,
    telegramId: user.telegramId,
  });

  const status = STATUS_COPY[verification.status] ? verification.status : 'not_started';
  const copy = STATUS_COPY[status];

  async function handleRequest() {
    if (user.isDemo) {
      writeDemoStatus(user.telegramId, { isVerified: false, status: 'requested', rejectionReason: null });
      await verification.refetch();
      return;
    }
    await requestVerification();
  }

  const showCta = status === 'not_started' || status === 'rejected';

  return (
    <section className="verification-card" aria-label="Verification">
      <div className="verification-card__header">
        <p className="eyebrow">{copy.eyebrow}</p>
        {verification.isVerified ? <VerifiedBadge size={20} /> : null}
      </div>

      <h2 className="verification-card__title">{copy.title}</h2>
      <p className="verification-card__body">
        {copy.body}
        {status === 'rejected' && verification.rejectionReason ? (
          <>
            {' '}
            <strong>
              Reason:
              {' '}
              {verification.rejectionReason}
            </strong>
          </>
        ) : null}
      </p>

      {verification.error ? <p className="verification-error" role="alert">{verification.error}</p> : null}

      {showCta ? (
        <button type="button" className="verification-cta verification-cta--inline" onClick={() => setModalOpen(true)}>
          Get verified
        </button>
      ) : (
        <p className="verification-card__hint">
          {status === 'pending_review'
            ? 'Checking for updates automatically.'
            : 'Head to @DategramAppBot to continue.'}
        </p>
      )}

      {modalOpen ? (
        <VerificationModal
          userPhotoUrl={user.photoUrl}
          displayName={user.name || user.firstName}
          isDemo={user.isDemo}
          onRequest={handleRequest}
          onClose={() => setModalOpen(false)}
        />
      ) : null}
    </section>
  );
}
