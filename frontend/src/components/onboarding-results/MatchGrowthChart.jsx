const CHART_POINTS = [
  { week: 'Now', matches: 2, label: '2/week' },
  { week: 'Week 2', matches: 5 },
  { week: 'Week 3', matches: 8 },
  { week: 'After 4 weeks', matches: 12, label: '12/week' },
];

/**
 * Illustrative four-week match-growth curve. The same path is reused from the Phase 2
 * `match-growth` interstitial so the onboarding promise and the plan screen cannot drift
 * apart. Purely illustrative — both call sites carry a disclaimer.
 */
export default function MatchGrowthChart({ showEndpoints = false }) {
  return (
    <div className="growth-chart">
      <div className="growth-chart__labels" aria-hidden="true">
        <span>12</span>
        <span>8</span>
        <span>4</span>
        <span>0</span>
      </div>
      <svg viewBox="0 0 330 170" role="img" aria-label="Matches increase from 2 per week now to 12 per week after 4 weeks">
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
        <circle cx="22" cy="137" r="5" />
        <circle cx="315" cy="18" r="5" />
        {showEndpoints ? (
          <g className="growth-endpoints">
            <g transform="translate(22 137)"><rect x="4" y="-30" width="52" height="20" rx="10" /><text x="30" y="-16">{CHART_POINTS[0].label}</text></g>
            <g transform="translate(315 18)"><rect x="-56" y="10" width="52" height="20" rx="10" /><text x="-30" y="24">{CHART_POINTS[3].label}</text></g>
          </g>
        ) : null}
      </svg>
      <div className="growth-weeks" aria-hidden="true">
        <span>Week 1</span>
        <span>Week 2</span>
        <span>Week 3</span>
        <span>Week 4</span>
      </div>
    </div>
  );
}

export { CHART_POINTS };
