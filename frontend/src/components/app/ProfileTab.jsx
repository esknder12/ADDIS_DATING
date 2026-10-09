import { useMemo, useState } from 'react';
import { onboardingQuestionByKey } from '@dategram/shared/onboarding';
import { computeMatchResult } from '@dategram/shared/results';
import { loadOnboardingAnswers } from '../../lib/demoStore.js';
import { impact } from '../../lib/telegram.js';
import { ChevronRightIcon, CloseIcon, VerifiedBadge } from './icons.jsx';

function initials(user, name) {
  const source = name || user.firstName || 'D';
  return source.split(' ').filter(Boolean).slice(0, 2)
    .map((part) => part.charAt(0).toUpperCase()).join('') || 'D';
}

function SettingRow({ icon, label, chevron = true, onClick, tone }) {
  return (
    <button type="button" className={`setting-row${tone ? ` setting-row--${tone}` : ''}`} onClick={onClick}>
      <span className="setting-row__icon" aria-hidden="true">{icon}</span>
      <span>{label}</span>
      {chevron && <span className="setting-row__chevron" aria-hidden="true"><ChevronRightIcon /></span>}
    </button>
  );
}

export default function ProfileTab({ user, appData, photoUrl, onShowVerification, onShowPaywall, onSaveProfile }) {
  const { profile } = appData;
  const [sheet, setSheet] = useState(null); // edit | info | score | looking | faq | privacy
  const [draftName, setDraftName] = useState(profile.name || user.firstName || '');
  const [draftBio, setDraftBio] = useState(user.bio || '');

  const displayName = profile.name || [user.firstName, user.lastName].filter(Boolean).join(' ') || 'You';
  const answers = useMemo(() => loadOnboardingAnswers(user.telegramId), [user.telegramId]);
  const result = useMemo(() => profile.results || computeMatchResult(answers), [answers, profile.results]);

  const lookingSummary = useMemo(() => {
    const labels = (values, key) => (Array.isArray(values) ? values : [values])
      .filter(Boolean)
      .map((id) => onboardingQuestionByKey.get(key)?.options?.find((option) => option.id === id)?.label)
      .filter(Boolean);
    return {
      lookingFor: labels(answers.looking_for, 'looking_for').join(', ') || '—',
      aboutYou: labels(answers.style_preference, 'style_preference').join(', ') || '—',
      ageRange: labels(answers.age_range_preference, 'age_range_preference').join(', ') || '—',
      availability: labels(answers.meeting_availability, 'meeting_availability').join(', ') || '—',
    };
  }, [answers]);

  const saveName = async () => {
    const trimmed = draftName.trim();
    if (trimmed.length < 2) return;
    await onSaveProfile({ name: trimmed });
    setSheet(null);
  };

  const verificationCopy = profile.verificationStatus === 'pending'
    ? 'Verification pending'
    : profile.verificationStatus === 'verified'
      ? 'Verified'
      : '✓ Get verified';

  return (
    <div className="tab-stage profile-stage">
      <header className="profile-header">
        <div className="profile-avatar">
          {photoUrl ? <img src={photoUrl} alt="" /> : <span>{initials(user, displayName)}</span>}
          {(profile.verificationStatus === 'verified') && <span className="profile-avatar__badge"><VerifiedBadge size={22} /></span>}
        </div>
        <h1>{displayName.toUpperCase()}</h1>
        <p className="profile-meta">
          <strong>{result.score >= 0 ? (answers.age || '') : ''}</strong>
          {user.city || answers.location?.name || 'Addis Ababa'}, {user.country || answers.location?.country || 'Ethiopia'}
        </p>
      </header>

      {!profile.isVip ? (
        <section className="vip-card">
          <div className="vip-card__copy">
            <p className="vip-card__brand">Dategram <span className="vip-tag vip-tag--orange">VIP</span></p>
            <strong>Free messages</strong>
          </div>
          <button type="button" className="vip-card__activate" onClick={() => onShowPaywall('default')}>
            Activate
          </button>
        </section>
      ) : (
        <section className="vip-card vip-card--active">
          <div className="vip-card__copy">
            <p className="vip-card__brand">Dategram <span className="vip-tag vip-tag--orange">VIP</span></p>
            <strong>VIP active — free messages unlocked ✨</strong>
            {profile.discountPercent ? <small>{profile.discountPercent}% promo applied ({profile.promoCode})</small> : null}
          </div>
        </section>
      )}

      <button
        type="button"
        className={`verification-row${profile.verificationStatus !== 'none' ? ' verification-row--pending' : ''}`}
        onClick={() => { impact('light'); onShowVerification(); }}
      >
        <span>{verificationCopy}</span>
        <ChevronRightIcon />
      </button>

      <section className="settings-group" aria-label="Profile management">
        <h3>Profile management</h3>
        <SettingRow icon="👤" label="Edit profile" onClick={() => { setDraftName(profile.name || displayName); setSheet('edit'); }} />
        <SettingRow icon="📄" label="Additional info" onClick={() => setSheet('info')} />
        <SettingRow icon="🤖" label="AI profile score" onClick={() => setSheet('score')} />
        <SettingRow icon="🔍" label="Looking for" onClick={() => setSheet('looking')} />
      </section>

      <section className="settings-group" aria-label="Support">
        <h3>Support</h3>
        <SettingRow icon="➤" label="Contact support" onClick={() => setSheet('support')} />
        <SettingRow icon="❓" label="FAQ" onClick={() => setSheet('faq')} />
        <SettingRow icon="📄" label="Privacy policy" onClick={() => setSheet('privacy')} />
      </section>

      {sheet && (
        <div className="sheet-backdrop" role="presentation" onClick={() => setSheet(null)}>
          <div className="sheet" role="dialog" aria-modal="true" onClick={(event) => event.stopPropagation()}>
            <button type="button" className="icon-button sheet__close" aria-label="Close" onClick={() => setSheet(null)}>
              <CloseIcon />
            </button>
            <div className="sheet__grabber" aria-hidden="true" />

            {sheet === 'edit' && (
              <>
                <h2>Edit profile</h2>
                <label className="promo-field">
                  <span>Your name</span>
                  <input type="text" value={draftName} maxLength={60} onChange={(event) => setDraftName(event.target.value)} />
                </label>
                <button type="button" className="onboarding-primary" onClick={saveName} disabled={draftName.trim().length < 2}>
                  SAVE
                </button>
              </>
            )}

            {sheet === 'info' && (
              <>
                <h2>Additional info</h2>
                <label className="promo-field">
                  <span>Bio</span>
                  <textarea rows="4" value={draftBio} maxLength={280}
                    placeholder="A line or two that makes you, you"
                    onChange={(event) => setDraftBio(event.target.value)} />
                </label>
                <button type="button" className="onboarding-primary" onClick={async () => { await onSaveProfile({ bio: draftBio.trim() }); setSheet(null); }}>
                  SAVE
                </button>
              </>
            )}

            {sheet === 'score' && (
              <>
                <h2>Profile Score</h2>
                <div className="score-loader" aria-hidden="true">
                  <span />
                </div>
                <p className="score-learning">Learning...</p>
                <p className="score-note">We’ll let you know when the score is ready</p>
                <button type="button" className="onboarding-primary score-button" disabled>Find out the score</button>
                <div className="score-stats">
                  <h4>Profile statistics</h4>
                  <dl>
                    <div><dt>Match potential</dt><dd>{result.score}/100</dd></div>
                    <div><dt>Dating style</dt><dd>{result.datingStyle}</dd></div>
                    <div><dt>Response rate</dt><dd>{result.responseLabel}</dd></div>
                    <div><dt>Match pool</dt><dd>{result.matchPoolLabel}</dd></div>
                  </dl>
                </div>
              </>
            )}

            {sheet === 'looking' && (
              <>
                <h2>Looking for</h2>
                <dl className="looking-list">
                  <div><dt>Intentions</dt><dd>{lookingSummary.lookingFor}</dd></div>
                  <div><dt>Your type</dt><dd>{lookingSummary.aboutYou}</dd></div>
                  <div><dt>Age range</dt><dd>{lookingSummary.ageRange}</dd></div>
                  <div><dt>Free to meet</dt><dd>{lookingSummary.availability}</dd></div>
                </dl>
                <small>Start onboarding again from the top bar to adjust these answers.</small>
              </>
            )}

            {sheet === 'support' && (
              <>
                <h2>Contact support</h2>
                <p>Message us any time at <strong>@DategramAppBot</strong> — we reply within a day.</p>
              </>
            )}

            {sheet === 'faq' && (
              <>
                <h2>FAQ</h2>
                <dl className="faq-list">
                  <div><dt>Is Dategram free?</dt><dd>Yes. VIP adds free direct messages and visibility perks.</dd></div>
                  <div><dt>How do matches work?</dt><dd>You match when both sides like each other. Messaging always requires a match.</dd></div>
                  <div><dt>How do I get verified?</dt><dd>Tap Get verified on your profile and send a short video note from Telegram.</dd></div>
                </dl>
              </>
            )}

            {sheet === 'privacy' && (
              <>
                <h2>Privacy policy</h2>
                <p>Dategram runs inside Telegram. Your Telegram credentials never leave Telegram; we receive only signed profile basics. Answers you give personalize your matches and are never sold. City-level location is shown, never exact coordinates.</p>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
