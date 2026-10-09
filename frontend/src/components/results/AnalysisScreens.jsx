import { useEffect, useMemo, useRef, useState } from 'react';

const reducedMotion = typeof window !== 'undefined'
  && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

function useStepTimer(durationMs, onFinished) {
  const [progress, setProgress] = useState(0);
  const finishedRef = useRef(false);

  useEffect(() => {
    finishedRef.current = false;
    const started = Date.now();
    let raf;
    const tick = () => {
      const elapsed = Date.now() - started;
      const value = Math.min(1, elapsed / durationMs);
      setProgress(value);
      if (value >= 1) {
        if (!finishedRef.current) {
          finishedRef.current = true;
          onFinished();
        }
        return;
      }
      raf = window.setTimeout(tick, 66);
    };
    tick();
    return () => window.clearTimeout(raf);
  }, [durationMs, onFinished]);

  return progress;
}

/** R1 — "Analyzing your answers..." animated checklist. */
export function AnswerAnalysisScreen({ step, onFinished }) {
  const progress = useStepTimer(reducedMotion ? 900 : step.durationMs, onFinished);
  const [badgeIndex, setBadgeIndex] = useState(0);

  useEffect(() => {
    const interval = window.setInterval(() => {
      setBadgeIndex((index) => (index + 1) % step.badges.length);
    }, 2200);
    return () => window.clearInterval(interval);
  }, [step.badges.length]);

  return (
    <main className="results-screen" aria-live="polite">
      <div className="analysis-stage">
        <h1 className="results-heading">{step.heading}</h1>
        <ul className="analysis-rows">
          {step.rows.map((row, index) => {
            const rowStart = index / step.rows.length;
            const rowEnd = (index + 1) / step.rows.length;
            const rowProgress = Math.min(1, Math.max(0, (progress - rowStart) / (rowEnd - rowStart)));
            const complete = rowProgress >= 1;
            return (
              <li key={row.key} className={`analysis-row${complete ? ' analysis-row--done' : ''}`}>
                <span className={`analysis-check${complete ? ' analysis-check--done' : ''}`} aria-hidden="true">
                  {complete ? '✓' : ''}
                </span>
                <span className="analysis-row__label">{row.label}</span>
                <span className="analysis-row__track" aria-hidden="true">
                  <span
                    className="analysis-row__bar"
                    style={{ width: `${Math.round(rowProgress * 100)}%` }}
                  />
                </span>
              </li>
            );
          })}
        </ul>
      </div>
      <footer className="analysis-footer">
        <span className="trust-badge" key={badgeIndex}>{step.badges[badgeIndex]}</span>
      </footer>
    </main>
  );
}

/** R1b — "Finding women who match your type..." circular percentage + reviews. */
export function CandidateSearchScreen({ step, onFinished }) {
  const progress = useStepTimer(reducedMotion ? 900 : step.durationMs, onFinished);
  const percent = Math.round(progress * 100);

  const testimonialIndex = Math.min(
    step.testimonials.length - 1,
    Math.floor(progress * step.testimonials.length),
  );
  const testimonial = step.testimonials[testimonialIndex];

  const circle = useMemo(() => {
    const radius = 62;
    const circumference = 2 * Math.PI * radius;
    return { radius, circumference };
  }, []);

  return (
    <main className="results-screen" aria-live="polite">
      <div className="search-stage">
        <h1 className="results-heading results-heading--center">{step.heading}</h1>
        <div className="search-dial" role="progressbar" aria-valuenow={percent} aria-valuemin={0} aria-valuemax={100}>
          <svg viewBox="0 0 160 160" className="search-dial__ring" aria-hidden="true">
            <circle cx="80" cy="80" r={circle.radius} className="search-dial__track" />
            <circle
              cx="80"
              cy="80"
              r={circle.radius}
              className="search-dial__progress"
              strokeDasharray={circle.circumference}
              strokeDashoffset={(1 - progress) * circle.circumference}
            />
          </svg>
          <span className="search-dial__value">{percent}%</span>
        </div>
        <figure className="search-testimonial" key={testimonialIndex}>
          <div className="search-testimonial__stars" aria-label={`${testimonial.stars} out of 5 stars`}>
            {'★'.repeat(testimonial.stars)}
          </div>
          <blockquote>“{testimonial.quote}”</blockquote>
          <figcaption>{testimonial.author}</figcaption>
        </figure>
      </div>
    </main>
  );
}
