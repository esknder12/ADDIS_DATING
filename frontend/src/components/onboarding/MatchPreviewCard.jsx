/** Shared sample-match card (Roxy for men, Dawit for women). */
export default function MatchPreviewCard({ gender }) {
  const isFemale = gender === 'female';
  return (
    <div className="sample-match-card">
      <img src="/images/onboarding-social.jpg" alt="Sample match profile" />
      <span className="sample-match-card__shade" />
      <div className="sample-match-card__copy">
        <strong>{isFemale ? 'Dawit, 28' : 'Roxy, 26'} <b>✓</b></strong>
        <span>Looking for a meaningful connection</span>
      </div>
      <div className="sample-match-card__compatibility">94% match</div>
    </div>
  );
}
