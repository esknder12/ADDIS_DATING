import { useState } from 'react';
import { impact, notify } from '../../lib/telegram.js';
import { CloseIcon } from './icons.jsx';

const REPORT_REASONS = [
  { id: 'harassment', label: 'Harassment or bullying' },
  { id: 'spam', label: 'Spam or scam' },
  { id: 'fake_profile', label: 'Fake profile' },
  { id: 'inappropriate_content', label: 'Inappropriate photos or text' },
  { id: 'other', label: 'Something else' },
];

function failureMessage(error, fallback) {
  return error?.response?.data?.error?.message || error?.message || fallback;
}

export default function SafetyModal({ profile, initialView = 'menu', onBlock, onReport, onClose }) {
  const [view, setView] = useState(initialView); // menu | report | done
  const [reason, setReason] = useState('');
  const [details, setDetails] = useState('');
  const [alsoBlock, setAlsoBlock] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [doneCopy, setDoneCopy] = useState('');

  const name = profile?.name || 'this profile';

  const handleBlock = async () => {
    if (busy) return;
    impact('medium');
    setBusy(true);
    setError('');
    try {
      await onBlock(profile);
      notify('success');
      setDoneCopy(`${name} is blocked. You won't see each other anymore.`);
      setView('done');
    } catch (blockError) {
      setError(failureMessage(blockError, 'Could not block this profile. Please try again.'));
    } finally {
      setBusy(false);
    }
  };

  const handleReport = async () => {
    if (busy || !reason) return;
    impact('medium');
    setBusy(true);
    setError('');
    try {
      await onReport(profile, { reason, details: details.trim(), block: alsoBlock });
      notify('success');
      setDoneCopy(alsoBlock
        ? `Thanks — our team will review ${name}. They are blocked too.`
        : `Thanks — our team will review ${name}.`);
      setView('done');
    } catch (reportError) {
      setError(failureMessage(reportError, 'Could not send your report. Please try again.'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="sheet-backdrop" role="presentation" onClick={onClose}>
      <div
        className="sheet"
        role="dialog"
        aria-modal="true"
        aria-label={`Safety options for ${name}`}
        onClick={(event) => event.stopPropagation()}
      >
        <button type="button" className="icon-button sheet__close" aria-label="Close" onClick={onClose}>
          <CloseIcon />
        </button>
        <div className="sheet__grabber" aria-hidden="true" />

        {view === 'menu' && (
          <>
            <div className="sheet__body">
              <h2>{name}</h2>
              <p className="profile-form-note">
                Blocked people can&apos;t see you, match with you, or message you. You can unblock
                anyone later from Profile → Blocked users.
              </p>
              {error && <p className="field-error" role="alert">{error}</p>}
            </div>
            <div className="sheet__actions">
              <button
                type="button"
                className="onboarding-primary safety-danger"
                disabled={busy}
                onClick={handleBlock}
              >
                {busy ? 'BLOCKING…' : `BLOCK ${name}`}
              </button>
              <button
                type="button"
                className="onboarding-primary"
                disabled={busy}
                onClick={() => { setError(''); setView('report'); impact('light'); }}
              >
                REPORT INSTEAD
              </button>
            </div>
          </>
        )}

        {view === 'report' && (
          <>
            <div className="sheet__body">
              <h2>Report {name}</h2>
              <p className="sheet__label">WHAT HAPPENED?</p>
              <div className="safety-reasons">
                {REPORT_REASONS.map((entry) => (
                  <button
                    key={entry.id}
                    type="button"
                    className={`chip${reason === entry.id ? ' chip--active' : ''}`}
                    onClick={() => { setReason(entry.id); impact('light'); }}
                  >
                    {entry.label}
                  </button>
                ))}
              </div>
              <label className="promo-field">
                <span>Details (optional)</span>
                <textarea
                  rows="3"
                  value={details}
                  maxLength={500}
                  placeholder="Anything our team should know?"
                  onChange={(event) => setDetails(event.target.value)}
                />
              </label>
              <label className="settings-toggle">
                <span>
                  <strong>Also block {name}</strong>
                  <small>You won&apos;t see each other anymore.</small>
                </span>
                <input
                  type="checkbox"
                  checked={alsoBlock}
                  onChange={(event) => setAlsoBlock(event.target.checked)}
                />
              </label>
              {error && <p className="field-error" role="alert">{error}</p>}
            </div>
            <div className="sheet__actions">
              <button
                type="button"
                className="onboarding-primary"
                disabled={busy || !reason}
                onClick={handleReport}
              >
                {busy ? 'SENDING…' : 'SEND REPORT'}
              </button>
            </div>
          </>
        )}

        {view === 'done' && (
          <>
            <div className="sheet__body safety-done">
              <div className="safety-done__icon" aria-hidden="true">✅</div>
              <h2>Done</h2>
              <p className="profile-form-note">{doneCopy}</p>
            </div>
            <div className="sheet__actions">
              <button type="button" className="onboarding-primary" onClick={onClose}>
                DONE
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
