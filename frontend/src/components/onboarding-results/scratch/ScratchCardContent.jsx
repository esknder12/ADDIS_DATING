export default function ScratchCardContent({ discountPercent, promoCode, expiresAt }) {
  const expiryLabel = expiresAt
    ? new Date(expiresAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
    : null;

  return (
    <div className="scratch-content">
      <p className="scratch-content__amount">
        {discountPercent}
        <span>%</span>
      </p>
      <p className="scratch-content__line">discount</p>
      <p className="scratch-content__line">on your Premium</p>

      <span className="scratch-divider" aria-hidden="true" />

      <p className="scratch-content__label">Promo code</p>
      <p className="scratch-code">
        <code>{promoCode}</code>
        <span className="scratch-code__check" aria-hidden="true">✓</span>
      </p>
      <p className="scratch-content__caption">
        Applied automatically at checkout
        {expiryLabel ? ` · valid until ${expiryLabel}` : ''}
      </p>
    </div>
  );
}
