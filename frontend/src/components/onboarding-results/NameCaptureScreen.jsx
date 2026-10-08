import { useState } from 'react';
import { validateNameInput } from '../../lib/resultsStores.js';

export default function NameCaptureScreen({ initialName, onSubmit, submitting, error }) {
  const [value, setValue] = useState(initialName || '');

  const validation = validateNameInput(value);
  const canContinue = validation.valid;

  async function submit(event) {
    event.preventDefault();
    if (!canContinue || submitting) return;
    await onSubmit(validation.value);
  }

  return (
    <main className="results-screen capture-screen">
      <header className="results-header">
        <p className="eyebrow">STEP 2 OF 2</p>
        <h1>What’s your name?</h1>
        <p className="results-subtitle">This is how your matches will see you.</p>
      </header>

      <form className="capture-form" onSubmit={submit} noValidate>
        <label className="sr-only" htmlFor="results-name">Your name</label>
        <input
          id="results-name"
          className="underline-input"
          type="text"
          autoComplete="given-name"
          maxLength={80}
          placeholder="Your name"
          value={value}
          onChange={(event) => setValue(event.target.value)}
        />

        {value.length > 0 && !canContinue ? (
          <p className="capture-hint" role="alert">Use at least 2 characters.</p>
        ) : null}

        {error ? <p className="onboarding-error" role="alert">{error}</p> : null}

        <div className="question-footer">
          <button type="submit" className="onboarding-primary" disabled={!canContinue || submitting}>
            {submitting ? <span className="button-spinner" aria-hidden="true" /> : null}
            CONTINUE
          </button>
        </div>
      </form>
    </main>
  );
}
