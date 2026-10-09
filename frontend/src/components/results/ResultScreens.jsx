import { useState } from 'react';
import { validateDisplayName, validateEmail } from '@dategram/shared/results';

const scaleStops = ['LOW', 'AVERAGE', 'HIGH', 'VERY HIGH'];

/** R2 — Match-potential result card. */
export function MatchResultScreen({ step, result, photoUrl, onContinue }) {
  return (
    <main className="results-screen results-screen--pad">
      <h1 className="results-heading">{step.heading}</h1>

      <section className="match-card" aria-label="Your match potential">
        <div className="match-card__main">
          <p className="match-card__label">MATCH POTENTIAL</p>
          <span className="match-score-pill">You: <strong>{result.score}</strong></span>
          <div className="match-scale">
            <div className="match-scale__bar" aria-hidden="true">
              <span
                className="match-scale__dot"
                style={{ left: `calc(${result.positionPercent}% - 8px)` }}
              />
            </div>
            <div className="match-scale__labels">
              {scaleStops.map((stop) => (
                <span
                  key={stop}
                  className={stop.replace(' ', '-').toLowerCase() === result.band ? 'active' : ''}
                >
                  {stop}
                </span>
              ))}
            </div>
          </div>
        </div>
        <img
          className="match-card__photo"
          src={photoUrl || '/images/onboarding-professional.jpg'}
          alt=""
        />
      </section>

      <ul className="match-facts">
        <li><span className="match-facts__icon">✨</span><span>Your type: <strong>{result.typeSummary}</strong></span></li>
        <li>
          <span className="match-facts__icon">💬</span>
          <span>Dating style: <strong>{result.datingStyle}</strong></span>
          <span className="info-dot" title="Based on your social energy answers">ⓘ</span>
        </li>
        <li><span className="match-facts__icon">👥</span><span>Match pool: <strong>{result.matchPoolLabel}</strong></span></li>
        <li>
          <span className="match-facts__icon">🚩</span>
          <span>Response rate: <strong>{result.responseLabel}, {result.responseMultiplier.toFixed(1)}×</strong></span>
        </li>
      </ul>

      <button type="button" className="onboarding-primary results-cta" onClick={onContinue}>
        {step.cta}
      </button>
    </main>
  );
}

/** R3 — Optional email capture. */
export function EmailCaptureScreen({ step, onSubmit, onSkip, saving, error }) {
  const [email, setEmail] = useState('');
  const [touched, setTouched] = useState(false);
  const validation = validateEmail(email);

  return (
    <main className="results-screen results-screen--pad">
      <h1 className="results-heading">{step.heading}</h1>

      <label className={`input-shell${touched && !validation.valid ? ' input-shell--error' : ''}`}>
        <span className="input-shell__icon" aria-hidden="true">✉</span>
        <input
          type="email"
          inputMode="email"
          autoComplete="email"
          placeholder={step.placeholder}
          value={email}
          aria-label={step.placeholder}
          onChange={(event) => { setEmail(event.target.value); setTouched(false); }}
          onBlur={() => setTouched(true)}
        />
      </label>

      <p className="privacy-note">
        <span aria-hidden="true">🔒</span> {step.privacy}
      </p>

      {(touched && !validation.valid) && <p className="field-error" role="alert">{validation.error}</p>}
      {error && <p className="field-error" role="alert">{error}</p>}

      <button
        type="button"
        className="onboarding-primary results-cta"
        disabled={!validation.valid || saving}
        onClick={() => onSubmit(validation.valid ? validation.value : null)}
      >
        {step.cta}
      </button>
      <button type="button" className="secondary-link" onClick={onSkip} disabled={saving}>
        {step.skipCta}
      </button>
    </main>
  );
}

/** R4 — Required name capture. */
export function NameCaptureScreen({ step, defaultValue, onSubmit, saving, error }) {
  const [name, setName] = useState(defaultValue || '');
  const validation = validateDisplayName(name);

  return (
    <main className="results-screen results-screen--pad">
      <h1 className="results-heading">{step.heading}</h1>

      <input
        className="name-input"
        type="text"
        autoComplete="given-name"
        placeholder={step.placeholder}
        aria-label={step.placeholder}
        value={name}
        maxLength={60}
        onChange={(event) => setName(event.target.value)}
      />

      {error && <p className="field-error" role="alert">{error}</p>}

      <button
        type="button"
        className="onboarding-primary results-cta"
        disabled={!validation.valid || saving}
        onClick={() => (validation.valid ? onSubmit(validation.value) : undefined)}
      >
        {step.cta}
      </button>
    </main>
  );
}

/** R5 — Four-week Match Plan chart. */
export function MatchPlanScreen({ step, name, onContinue }) {
  const heading = name ? `${name}, ${step.headingSuffix}` : `Your 4-week Match Plan is ready`;

  // Smooth illustrative curve from "now" (2/week) to "after 4 weeks" (12/week).
  const path = 'M24,148 C80,140 110,108 160,78 C210,48 260,34 336,30';

  return (
    <main className="results-screen results-screen--pad">
      <h1 className="results-heading">{heading}</h1>

      <section className="plan-card" aria-label="Projected matches over four weeks">
        <p className="plan-card__title">YOUR MATCHES*</p>
        <svg viewBox="0 0 360 180" className="plan-chart" role="img"
             aria-label={`Illustrative curve growing from ${step.now.perWeek} matches per week now to ${step.later.perWeek} per week after four weeks`}>
          <defs>
            <linearGradient id="plan-fill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#FF2D55" stopOpacity="0.38" />
              <stop offset="100%" stopColor="#FF2D55" stopOpacity="0" />
            </linearGradient>
          </defs>
          <path d={`${path} L336,168 L24,168 Z`} fill="url(#plan-fill)" />
          <path d={path} className="plan-chart__line" />
          <circle cx="24" cy="148" r="5" className="plan-chart__point" />
          <circle cx="336" cy="30" r="5" className="plan-chart__point" />
          <text x="24" y="176" className="plan-chart__caption">{step.now.perWeek}/week · {step.now.label}</text>
          <text x="336" y="18" textAnchor="end" className="plan-chart__caption">
            {step.later.perWeek}/week · {step.later.label}
          </text>
        </svg>
        <p className="plan-card__disclaimer">{step.disclaimer}</p>
      </section>

      <ul className="plan-benefits">
        {step.benefits.map((benefit) => (
          <li key={benefit.label}>
            <span aria-hidden="true">{benefit.icon}</span> {benefit.label}
          </li>
        ))}
      </ul>
      <p className="plan-footnote">{step.footnote}</p>

      <button type="button" className="onboarding-primary results-cta" onClick={onContinue}>
        {step.cta}
      </button>
    </main>
  );
}
