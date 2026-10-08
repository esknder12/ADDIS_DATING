import { impact } from '../../lib/telegram.js';
import MatchGrowthChart from '../onboarding-results/MatchGrowthChart.jsx';

function PhotoVisual({ step, verified = false }) {
  return (
    <div className="interstitial-photo">
      <img src={step.image} alt={step.imageAlt || ''} />
      <span className="interstitial-photo__shade" />
      {verified && <span className="verified-overlay"><b>✓</b> Verified</span>}
    </div>
  );
}

function MatchPreview() {
  return (
    <div className="sample-match-card">
      <img src="/images/onboarding-social.jpg" alt="Sample match profile" />
      <span className="sample-match-card__shade" />
      <div className="sample-match-card__copy">
        <strong>Roxy, 26 <b>✓</b></strong>
        <span>Looking for a meaningful connection</span>
      </div>
      <div className="sample-match-card__compatibility">94% match</div>
    </div>
  );
}

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

function GrowthChart() {
  return (
    <div className="growth-card">
      <div className="growth-callout"><span>▣</span><strong>40 women in Addis Ababa are free on weekends</strong></div>
      <MatchGrowthChart />
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

function Visual({ step }) {
  switch (step.variant) {
    case 'photo': return <PhotoVisual step={step} />;
    case 'verified-photo': return <PhotoVisual step={step} verified />;
    case 'match-preview': return <MatchPreview />;
    case 'avatar-cluster': return <AvatarCluster />;
    case 'success-check': return <SuccessCheck />;
    case 'algorithm': return <AlgorithmVisual />;
    case 'testimonials': return <Testimonials step={step} />;
    case 'growth-chart': return <GrowthChart />;
    case 'badges': return <TrustBadges step={step} />;
    default: return null;
  }
}

export default function InterstitialScreen({ step, onContinue, saving, error }) {
  async function continueFlow() {
    if (saving) return;
    impact('medium');
    await onContinue();
  }

  const visualFirst = ['success-check', 'algorithm'].includes(step.variant);

  return (
    <section className={`interstitial-screen interstitial-screen--${step.variant}`}>
      <div className="interstitial-scroll">
        {visualFirst && <Visual step={step} />}
        <div className="interstitial-copy">
          {step.eyebrow && <span className="interstitial-eyebrow">{step.eyebrow}</span>}
          <h1>{step.title}</h1>
          {step.body && <p>{step.body}</p>}
        </div>
        {!visualFirst && <Visual step={step} />}
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
