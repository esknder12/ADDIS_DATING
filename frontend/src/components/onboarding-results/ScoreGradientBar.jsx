const SCALE_LABELS = ['LOW', 'AVERAGE', 'HIGH', 'VERY HIGH'];

/**
 * The marker is positioned from the same numeric score that is displayed, so the dot and the
 * number can never disagree.
 */
export default function ScoreGradientBar({ score }) {
  const clamped = Math.max(0, Math.min(100, Number(score) || 0));

  return (
    <div className="score-scale">
      <div className="score-scale__track">
        <span className="score-scale__marker" style={{ left: `${clamped}%` }} aria-hidden="true" />
      </div>
      <div className="score-scale__labels" aria-hidden="true">
        {SCALE_LABELS.map((label) => <span key={label}>{label}</span>)}
      </div>
      <p className="sr-only">{`Match potential ${clamped} out of 100, rated ${scaleTier(clamped)}.`}</p>
    </div>
  );
}

function scaleTier(score) {
  if (score >= 85) return 'very high';
  if (score >= 70) return 'high';
  if (score >= 50) return 'average';
  return 'low';
}
