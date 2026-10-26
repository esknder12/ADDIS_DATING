import { useMemo, useState } from 'react';
import { giftCatalog } from '@libmatch/shared/catalog';
import { impact, notify, openInvoiceLink } from '../../lib/telegram.js';
import {
  CloseIcon,
  PlainHeartIcon,
  SendIcon,
  StarIcon,
  VerifiedBadge,
} from './icons.jsx';

export default function ProfileDetailSheet({
  member,
  isMatched,
  onClose,
  onSwipe,
  onSendGift,
  onConfirmGift,
  onDirectMessage,
  onOpenChat,
  onSafety,
}) {
  const [selectedGift, setSelectedGift] = useState('rose');
  const [giftBusy, setGiftBusy] = useState(false);
  const [giftSent, setGiftSent] = useState(null);
  const [giftError, setGiftError] = useState('');

  const gift = useMemo(() => giftCatalog.find((entry) => entry.id === selectedGift), [selectedGift]);

  const sendGift = async () => {
    if (giftBusy || !gift) return;
    setGiftBusy(true);
    setGiftError('');
    try {
      const order = await onSendGift({ profileId: member.id, giftId: gift.id, stars: gift.stars });
      if (order?.demo) {
        setGiftSent(gift);
        notify('success');
        return;
      }
      if (!order?.invoiceLink || !order?.clientRef) {
        throw new Error('invoice');
      }
      const status = await openInvoiceLink(order.invoiceLink);
      if (status === 'paid') {
        const done = await onConfirmGift({ clientRef: order.clientRef, status: 'paid' });
        if (done?.success) {
          setGiftSent(gift);
          notify('success');
        } else {
          setGiftError('Paid — the gift is on its way and will arrive shortly.');
          setGiftSent(gift);
        }
      } else if (status === 'cancelled') {
        await onConfirmGift({ clientRef: order.clientRef, status: 'cancelled' }).catch(() => null);
        setGiftError('Payment cancelled — no stars were charged.');
      } else if (status === 'unsupported') {
        setGiftError('Update Telegram to send gifts with Stars.');
      } else {
        await onConfirmGift({ clientRef: order.clientRef, status: 'failed' }).catch(() => null);
        setGiftError('Payment failed — no stars were charged. Try again.');
      }
    } catch {
      setGiftError('Could not start the payment. Try again.');
    }
    setGiftBusy(false);
  };

  const act = async (action) => {
    impact('medium');
    await onSwipe(member.id, action);
    onClose();
  };

  return (
    <div className="detail-backdrop" role="presentation" onClick={onClose}>
      <div className="detail-sheet" role="dialog" aria-modal="true" aria-label={`${member.name}'s profile`} onClick={(event) => event.stopPropagation()}>
        <div className="detail-sheet__scroll">
          <div className="detail-hero">
            <img src={member.photo} alt={member.name} />
            <button type="button" className="icon-button detail-sheet__close" aria-label="Close profile" onClick={onClose}>
              <CloseIcon />
            </button>
            <div className="detail-hero__scrim" aria-hidden="true" />
            <div className="detail-hero__info">
              <h2>{member.name} <span aria-hidden="true">{member.emoji}</span> {member.age} {member.verified && <VerifiedBadge size={20} />}</h2>
              <p>
                {[member.city, member.country].filter(Boolean).join(', ')}
                {member.distanceKm != null && ` · ${member.distanceKm} km away`}
              </p>
            </div>
          </div>

          <div className="detail-body">
            <p className="detail-intention">{member.intention}</p>
            <p className="detail-bio">{member.bio}</p>

            {member.interests?.length > 0 && (
              <ul className="chip-row chip-row--static">
                {member.interests.map((interest) => <li key={interest} className="chip chip--static">{interest}</li>)}
              </ul>
            )}

            <section className="gift-section" aria-label="Send a gift">
              <h3>Make happy {member.name}</h3>
              <p>Send her an exclusive gift</p>
              <div className="gift-grid" role="radiogroup" aria-label="Choose a gift">
                {giftCatalog.map((entry) => (
                  <button
                    key={entry.id}
                    type="button"
                    role="radio"
                    aria-checked={selectedGift === entry.id}
                    className={`gift-card${selectedGift === entry.id ? ' gift-card--selected' : ''}`}
                    onClick={() => { setSelectedGift(entry.id); impact('light'); }}
                  >
                    <span className="gift-card__icon" aria-hidden="true">{entry.icon}</span>
                    <strong>{entry.label}</strong>
                    <span className="gift-card__price">⭐ {entry.stars}</span>
                  </button>
                ))}
              </div>
              <button
                type="button"
                className="onboarding-primary gift-send"
                disabled={giftBusy || Boolean(giftSent)}
                onClick={sendGift}
              >
                {giftSent ? `SENT ${giftSent.icon}` : giftBusy ? 'PAYING…' : '🎁 Send gift'}
              </button>
              {giftError && <p className="field-error" role="alert">{giftError}</p>}
            </section>

            <div className="safety-row">
              <button
                type="button"
                className="report-button"
                onClick={() => onSafety?.(member)}
              >
                Block
              </button>
              <button
                type="button"
                className="report-button"
                onClick={() => onSafety?.(member, 'report')}
              >
                Report
              </button>
            </div>
          </div>
        </div>

        <div className="detail-actions" role="group" aria-label="Profile actions">
          <button type="button" className="swipe-action swipe-action--pass" aria-label="Pass" onClick={() => act('pass')}>
            <CloseIcon />
          </button>
          <button type="button" className="swipe-action swipe-action--super" aria-label="Super like" onClick={() => act('super_like')}>
            <StarIcon />
          </button>
          <button type="button" className="swipe-action swipe-action--like" aria-label="Like" onClick={() => act('like')}>
            <PlainHeartIcon />
          </button>
          <button
            type="button"
            className="swipe-action swipe-action--message"
            aria-label="Send message"
            onClick={() => (isMatched ? onOpenChat(member.id) : onDirectMessage(member))}
          >
            <SendIcon />
          </button>
        </div>
      </div>
    </div>
  );
}
