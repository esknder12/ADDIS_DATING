import { impact } from '../../lib/telegram.js';

function PhotoVisual({ step, verified = false }) {
  return (
    <div className="interstitial-photo">
      <img src={step.image} alt={step.imageAlt || ''} />
      <span className="interstitial-photo__shade" />
      {verified && <span className="verified-overlay"><b>✓</b> Verified</span>}
    </div>
  );
}

// Shared with question banners (see MatchPreviewCard.jsx).
import MatchPreview from './MatchPreviewCard.jsx';

function AvatarCluster() {
  const avatars = [
    ['social-left', '/images/onboarding-social.jpg'],
    ['lifestyle-close', '/images/onboarding-lifestyle.jpg'],
    ['social-right', '/images/onboarding-social.jpg'],
    ['lifestyle-wide', '/images/onboarding-lifestyle.jpg'],
  ];
  return (
    <div className="avatar-cluster">
      {avatars.map(([crop, source], index) => (
        <span
          key={crop}
          className={`avatar-cluster__avatar avatar-cluster__avatar--${index + 1} image-crop--${crop}`}
          style={{ backgroundImage: `url(${source})` }}
        ><b>✓</b></span>
      ))}
      <span className="avatar-cluster__heart">♥<b>✦</b></span>
    </div>
  );
}

function SuccessCheck() {
  return (
    <div className="success-orbit">
      <span className="success-orbit__ring success-orbit__ring--one" />
      <span className="success-orbit__ring success-orbit__ring--two" />
      <span className="success-orbit__check">✓</span>
    </div>
  );
}

function AlgorithmVisual() {
  return (
    <div className="algorithm-radar">
      <span className="algorithm-radar__ring algorithm-radar__ring--1" />
      <span className="algorithm-radar__ring algorithm-radar__ring--2" />
      <span className="algorithm-radar__ring algorithm-radar__ring--3" />
      <span className="algorithm-radar__pulse" />
      <span className="algorithm-radar__heart">♥</span>
    </div>
  );
}

function Testimonials({ step }) {
  return (
    <div className="testimonials-visual">
      <div className="success-stats">
        {step.stats.map((stat) => (
          <div key={stat.value}>
            <strong>{stat.value}</strong>
            <span>{stat.label}</span>
          </div>
        ))}
      </div>
      <div className="testimonial-list">
        {step.testimonials.map((testimonial, index) => (
          <article key={testimonial.name}>
            <header>
              <span
                className={`testimonial-avatar image-crop--${index ? 'lifestyle-close' : 'social-left'}`}
                style={{ backgroundImage: `url(${index ? '/images/onboarding-lifestyle.jpg' : '/images/onboarding-social.jpg'})` }}
              />
              <div>
                <strong>{testimonial.name}, {testimonial.age} <b>✓</b></strong>
                <span>{testimonial.location}</span>
              </div>
            </header>
            <p>“{testimonial.quote}”</p>
            <span className="testimonial-result">{testimonial.result}</span>
          </article>
        ))}
      </div>
    </div>
  );
}

function GrowthChart({ gender }) {
  const lookingForNoun = gender === 'female' ? 'men' : 'women';
  return (
    <div className="growth-card">
      <div className="growth-callout"><span>▣</span><strong>40 {lookingForNoun} in Addis Ababa are free on weekends</strong></div>
      <div className="growth-chart">
        <div className="growth-chart__labels"><span>12</span><span>8</span><span>4</span><span>0</span></div>
        <svg viewBox="0 0 330 170" role="img" aria-label="Matches increase from 2 in week one to 12 in week four">
          <defs>
            <linearGradient id="growth-line" x1="0" y1="0" x2="1" y2="0">
              <stop stopColor="#ff7c96" />
              <stop offset="1" stopColor="#ff2d55" />
            </linearGradient>
            <linearGradient id="growth-fill" x1="0" y1="0" x2="0" y2="1">
              <stop stopColor="#ff2d55" stopOpacity=".34" />
              <stop offset="1" stopColor="#ff2d55" stopOpacity="0" />
            </linearGradient>
          </defs>
          <g className="growth-grid"><path d="M15 20H320M15 62H320M15 104H320M15 146H320" /></g>
          <path className="growth-area" d="M22 137C70 134 92 116 121 108S178 91 207 71s64-49 108-53v128H22Z" />
          <path className="growth-line" d="M22 137C70 134 92 116 121 108S178 91 207 71s64-49 108-53" />
          <circle cx="22" cy="137" r="5" /><circle cx="315" cy="18" r="5" />
        </svg>
        <div className="growth-weeks"><span>Week 1</span><span>Week 2</span><span>Week 3</span><span>Week 4</span></div>
      </div>
    </div>
  );
}

function TrustBadges({ step }) {
  return (
    <div className="trust-badges">
      {step.badges.map((badge) => (
        <article key={badge.title}>
          <span>{badge.icon}</span>
          <div><strong>{badge.title}</strong><small>{badge.meta}</small></div>
          <b>✓</b>
        </article>
      ))}
    </div>
  );
}

function Visual({ gender, step }) {
  switch (step.variant) {
    case 'photo': return <PhotoVisual step={step} />;
    case 'verified-photo': return <PhotoVisual step={step} verified />;
    case 'match-preview': return <MatchPreview gender={gender} />;
    case 'avatar-cluster': return <AvatarCluster />;
    case 'success-check': return <SuccessCheck />;
    case 'algorithm': return <AlgorithmVisual />;
    case 'testimonials': return <Testimonials step={step} />;
    case 'growth-chart': return <GrowthChart gender={gender} />;
    case 'badges': return <TrustBadges step={step} />;
    default: return null;
  }
}

export default function InterstitialScreen({ gender, step, onContinue, saving, error }) {
  async function continueFlow() {
    if (saving) return;
    impact('medium');
    await onContinue();
  }

  const visualFirst = ['success-check', 'algorithm'].includes(step.variant);

  return (
    <section className={`interstitial-screen interstitial-screen--${step.variant}`}>
      <div className="interstitial-scroll">
        {visualFirst && <Visual gender={gender} step={step} />}
        <div className="interstitial-copy">
          {step.eyebrow && <span className="interstitial-eyebrow">{step.eyebrow}</span>}
          <h1>{step.title}</h1>
          {step.body && <p>{step.body}</p>}
        </div>
        {!visualFirst && <Visual gender={gender} step={step} />}
        {error && <p className="onboarding-error" role="alert">{error}</p>}
      </div>
      <div className="question-footer">
        <button type="button" className="onboarding-primary" onClick={continueFlow} disabled={saving}>
          {saving ? <span className="button-spinner" aria-label="Saving" /> : 'CONTINUE'}
        </button>
      </div>
    </section>
  );
}
