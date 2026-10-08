import { useState } from 'react';
import { validateEmailInput } from '../../lib/resultsStores.js';

export default function EmailCaptureScreen({ initialEmail, onSubmit, onSkip, submitting, error }) {
  const [value, setValue] = useState(initialEmail || '');

  const validation = validateEmailInput(value);
  const canContinue = validation.valid && validation.value !== null;

  async function submit(event) {
    event.preventDefault();
    if (!canContinue || submitting) return;
    await onSubmit(validation.value);
  }

  return (
    <main className="results-screen capture-screen">
      <header className="results-header">
        <p className="eyebrow">STEP 1 OF 2</p>
        <h1>Enter your email to get your personalized Match Report and meet her</h1>
      </header>

      <form className="capture-form" onSubmit={submit} noValidate>
        <label className="sr-only" htmlFor="results-email">Your email</label>
        <div className={`capture-field${value.length > 0 && !canContinue ? ' is-invalid' : ''}`}>
          <span className="capture-field__icon" aria-hidden="true">
            <svg viewBox="0 0 24 24"><rect x="3" y="5.5" width="18" height="13" rx="2.5" /><path d="m3.8 7 8.2 6 8.2-6" /></svg>
          </span>
          <input
            id="results-email"
            type="email"
            inputMode="email"
            autoComplete="email"
            autoCapitalize="none"
            spellCheck="false"
            placeholder="Your email"
            value={value}
            onChange={(event) => setValue(event.target.value)}
          />
        </div>

        {value.length > 0 && !canContinue ? (
          <p className="capture-hint" role="alert">That email doesn’t look right yet.</p>
        ) : (
          <p className="capture-hint">We respect your privacy and never share your email. Your Match Report stays between us.</p>
        )}

        {error ? <p className="onboarding-error" role="alert">{error}</p> : null}

        <div className="question-footer">
          <button type="submit" className="onboarding-primary" disabled={!canContinue || submitting}>
            {submitting ? <span className="button-spinner" aria-hidden="true" /> : null}
            CONTINUE
          </button>
          <button type="button" className="text-link" onClick={onSkip} disabled={submitting}>
            SKIP THIS STEP
          </button>
        </div>
      </form>
    </main>
  );
}
