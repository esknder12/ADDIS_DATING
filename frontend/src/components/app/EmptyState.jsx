export default function EmptyState({ icon, heading, copy, action }) {
  return (
    <div className="empty-state">
      <div className="empty-state__art" aria-hidden="true">{icon}</div>
      <h2>{heading}</h2>
      {copy && <p>{copy}</p>}
      {action}
    </div>
  );
}
