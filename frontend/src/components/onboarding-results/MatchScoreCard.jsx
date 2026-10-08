import ScoreGradientBar from './ScoreGradientBar.jsx';

function initials(name) {
  return String(name || '')
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part.charAt(0).toUpperCase())
    .join('') || 'D';
}

export default function MatchScoreCard({ results, fallbackName, onContinue, submitting }) {
  const displayName = results.name || fallbackName || 'there';

  return (
    <main className="results-screen score-screen">
      <header className="results-header">
        <p className="eyebrow">MATCH REPORT</p>
        <h1>Here’s your dating profile</h1>
        <p className="results-subtitle">{displayName}, this is how our matching engine reads your answers.</p>
      </header>

      <section className="score-card" aria-label="Match potential">
        <div className="score-card__top">
          <div>
            <p className="score-card__label">MATCH POTENTIAL</p>
            <span className="score-pill">You: {results.score}</span>
          </div>
          <div className="score-card__photo">
            {results.photoUrl ? (
              <img src={results.photoUrl} alt="" />
            ) : (
              <span className="score-card__initials">{initials(displayName)}</span>
            )}
          </div>
        </div>

        <ScoreGradientBar score={results.score} />

        <dl className="score-stats">
          <div>
            <dt><span aria-hidden="true">✨</span> Your type</dt>
            <dd>{results.yourType}</dd>
          </div>
          <div>
            <dt>
              <span aria-hidden="true">💬</span> Dating style
              <span className="info-dot" title="Derived from how you start conversations">ⓘ</span>
            </dt>
            <dd>{results.datingStyle}</dd>
          </div>
          <div>
            <dt><span aria-hidden="true">👥</span> Match pool</dt>
            <dd>
              {results.matchPoolCount}
              {' '}
              women in
              {' '}
              {results.matchPoolCity || 'your area'}
            </dd>
          </div>
          <div>
            <dt><span aria-hidden="true">🚩</span> Response rate</dt>
            <dd>
              Above average,
              {' '}
              {results.responseRateMultiplier}
              ×
            </dd>
          </div>
        </dl>
      </section>

      <div className="question-footer">
        <button type="button" className="onboarding-primary" onClick={onContinue} disabled={submitting}>
          CONTINUE
        </button>
      </div>
    </main>
  );
}
