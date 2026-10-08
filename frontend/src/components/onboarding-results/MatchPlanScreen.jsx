import MatchGrowthChart from './MatchGrowthChart.jsx';

export default function MatchPlanScreen({ results, fallbackName, onContinue, submitting }) {
  const name = (results.name || fallbackName || 'there').toUpperCase();

  return (
    <main className="results-screen plan-screen">
      <header className="results-header">
        <p className="eyebrow">YOUR PLAN</p>
        <h1>
          {name}
          , your 4-week Match Plan is ready
        </h1>
      </header>

      <section className="plan-card" aria-label="Your matches projection">
        <p className="plan-card__title">YOUR MATCHES*</p>
        <MatchGrowthChart showEndpoints />
        <p className="plan-card__note">This chart is for illustrative purposes only.</p>
      </section>

      <ul className="plan-benefits">
        <li>
          <span aria-hidden="true">⭐</span>
          Perfect for your
          {' '}
          {results.datingStyle}
          {' '}
          dating style
        </li>
        <li><span aria-hidden="true">✓</span> Customized based on your answers</li>
        <li>
          <span aria-hidden="true">➤</span>
          Goal:
          {' '}
          {results.fourWeekGoalLabel}
        </li>
      </ul>

      <p className="plan-footnote">*Based on Premium users with a similar profile. Results vary.</p>

      <div className="question-footer">
        <button type="button" className="onboarding-primary" onClick={onContinue} disabled={submitting}>
          CONTINUE
        </button>
      </div>
    </main>
  );
}
