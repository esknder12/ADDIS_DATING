/**
 * Reusable verified checkmark. Sized in px so it can sit next to a name on a swipe card, a
 * profile detail sheet, or a chat header in later phases.
 */
export default function VerifiedBadge({ size = 20, label = 'Verified' }) {
  return (
    <span className="verified-badge" style={{ width: size, height: size }} role="img" aria-label={label}>
      <svg viewBox="0 0 24 24" width={Math.round(size * 0.62)} height={Math.round(size * 0.62)} aria-hidden="true">
        <path d="M9.6 16.2 5.4 12l-1.4 1.4L9.6 19 21 7.6l-1.4-1.4z" />
      </svg>
    </span>
  );
}
