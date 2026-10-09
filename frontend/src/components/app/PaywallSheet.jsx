import { useMemo, useState } from 'react';
import { vipPlans } from '@dategram/shared/catalog';
import { notify } from '../../lib/telegram.js';
import { CloseIcon } from './icons.jsx';

const contextCopy = {
  default: { title: 'Dategram VIP', note: 'Free messages and all premium perks' },
  boost: { title: 'Put your profile on top', note: 'Boosts are a VIP perk — get seen first in your area' },
  'direct-message': { title: 'Message before matching', note: 'Direct messages are a Dategram VIP feature' },
  likes: { title: 'See who likes you', note: 'Reveal your admirers and skip the wait' },
};

export default function PaywallSheet({ context = 'default', promo, onActivate, onClose }) {
  const copy = contextCopy[context] || contextCopy.default;
  const [planId, setPlanId] = useState('monthly');
  const [promoInput, setPromoInput] = useState(promo?.code || '');
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState('');

  const promoValid = promoInput.trim().toLowerCase() === 'dategram_oct26';
  const discountPercent = promoValid ? 50 : (promo?.code && promoInput.trim() === '' ? 0 : 0);

  const priceLabel = useMemo(() => {
    const plan = vipPlans.find((entry) => entry.id === planId);
    if (!plan) return '';
    const price = promoValid ? Math.ceil(plan.basePriceStars / 2) : plan.basePriceStars;
    return `${price} ⭐`;
  }, [planId, promoValid]);

  const activate = async () => {
    if (busy) return;
    setBusy(true);
    setError('');
    try {
      await onActivate({
        planId,
        promoCode: promoValid ? 'dategram_oct26' : undefined,
      });
      setDone(true);
      notify('success');
      window.setTimeout(onClose, 1600);
    } catch (requestError) {
      setError(requestError?.response?.data?.error?.message || 'Activation failed. Please try again.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="sheet-backdrop" role="presentation" onClick={onClose}>
      <div className="sheet paywall" role="dialog" aria-modal="true" aria-labelledby="vip-heading" onClick={(event) => event.stopPropagation()}>
        <button type="button" className="icon-button sheet__close" aria-label="Close" onClick={onClose}>
          <CloseIcon />
        </button>
        <div className="sheet__grabber" aria-hidden="true" />

        {done ? (
          <div className="paywall__success">
            <span className="paywall__success-mark" aria-hidden="true">✓</span>
            <h2 id="vip-heading">Welcome to VIP ✨</h2>
            <p>Free messages unlocked. Have great conversations!</p>
          </div>
        ) : (
          <>
            <p className="paywall__brand">Dategram <span className="vip-tag">VIP</span></p>
            <h2 id="vip-heading">{copy.title}</h2>
            <p className="paywall__note">{copy.note}</p>

            <ul className="paywall__perks">
              <li>💬 Free direct messages</li>
              <li>👀 See everyone who liked you</li>
              <li>⚡ Priority placement in Discover</li>
              <li>↺ Unlimited rewinds</li>
            </ul>

            <div className="plan-row" role="radiogroup" aria-label="VIP plan">
              {vipPlans.map((plan) => {
                const selected = plan.id === planId;
                const price = promoValid ? Math.ceil(plan.basePriceStars / 2) : plan.basePriceStars;
                return (
                  <button
                    key={plan.id}
                    type="button"
                    role="radio"
                    aria-checked={selected}
                    className={`plan${selected ? ' plan--selected' : ''}`}
                    onClick={() => setPlanId(plan.id)}
                  >
                    <strong>{plan.label}</strong>
                    <span>{price} ⭐ {promoValid && <s>{plan.basePriceStars}</s>}</span>
                    <small>{plan.perk}</small>
                  </button>
                );
              })}
            </div>

            <label className="promo-field">
              <span>Promo code {promoValid && <em aria-live="polite">· −50% applied</em>}</span>
              <input
                type="text"
                value={promoInput}
                placeholder="dategram_oct26"
                onChange={(event) => setPromoInput(event.target.value)}
              />
            </label>
            {discountPercent > 0 && <p className="promo-note">✓ {discountPercent}% off, applied automatically at checkout</p>}

            {error && <p className="field-error" role="alert">{error}</p>}

            <button type="button" className="onboarding-primary" disabled={busy} onClick={activate}>
              {busy ? 'PROCESSING…' : `ACTIVATE · ${priceLabel}`}
            </button>
            <small className="paywall__legal">
              Demo checkout — production purchases settle via Telegram Stars invoices with server-side confirmation.
            </small>
          </>
        )}
      </div>
    </div>
  );
}
