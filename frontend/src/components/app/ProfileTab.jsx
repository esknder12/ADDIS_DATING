import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { onboardingQuestionByKey } from '@dategram/shared/onboarding';
import { computeMatchResult } from '@dategram/shared/results';
import { loadOnboardingAnswers } from '../../lib/demoStore.js';
import {
  impact,
  setTelegramMainButtonEnabled,
  setTelegramMainButtonLoading,
  showTelegramBackButton,
  showTelegramMainButton,
} from '../../lib/telegram.js';
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

function fieldError(error, fallback) {
  return error?.response?.data?.error?.message || error?.message || fallback;
}

export default function ProfileTab({ user, appData, photoUrl, onShowVerification, onShowPaywall }) {
  const { profile } = appData;
  const [sheet, setSheet] = useState(null); // edit | info | score | looking | settings | support | faq | privacy
  const [draftName, setDraftName] = useState(profile.name || user.firstName || '');
  const [draftBio, setDraftBio] = useState(profile.bio || user.bio || '');
  const [draftCity, setDraftCity] = useState(profile.city || user.city || '');
  const [draftCountry, setDraftCountry] = useState(profile.country || user.country || '');
  const [additionalDraft, setAdditionalDraft] = useState(profile.additionalInfo || {});
  const [notificationsEnabled, setNotificationsEnabled] = useState(
    profile.settings?.notificationsEnabled !== false,
  );
  const [saving, setSaving] = useState(false);
  const [scoreBusy, setScoreBusy] = useState(false);
  const [photoBusy, setPhotoBusy] = useState(false);
  const [actionError, setActionError] = useState('');
  const [photoError, setPhotoError] = useState('');
  const fileInputRef = useRef(null);
  const editSaveRef = useRef(null);

  const displayName = profile.name || [user.firstName, user.lastName].filter(Boolean).join(' ') || 'You';
  const answers = useMemo(() => loadOnboardingAnswers(user.telegramId), [user.telegramId]);
  const result = useMemo(() => profile.results || computeMatchResult(answers), [answers, profile.results]);
  const photos = Array.isArray(profile.photos) ? profile.photos : [];
  const visiblePhoto = profile.photoUrl || photos.find((photo) => photo.isPrimary)?.url || photoUrl;

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

  const saveEdit = useCallback(async () => {
    const name = draftName.trim();
    if (name.length < 2 || saving) return;
    setSaving(true);
    setActionError('');
    try {
      await appData.saveProfile({
        name,
        bio: draftBio.trim(),
        city: draftCity.trim(),
        country: draftCountry.trim(),
      });
      setSheet(null);
    } catch (error) {
      setActionError(fieldError(error, 'Could not save your profile. Please try again.'));
    } finally {
      setSaving(false);
    }
  }, [appData.saveProfile, draftBio, draftCity, draftCountry, draftName, saving]);

  useEffect(() => { editSaveRef.current = saveEdit; }, [saveEdit]);

  useEffect(() => {
    if (sheet !== 'edit') return undefined;
    const closeEditor = () => setSheet(null);
    const hideMainButton = showTelegramMainButton('SAVE PROFILE', () => {
      void editSaveRef.current?.();
    });
    const hideBackButton = showTelegramBackButton(closeEditor);
    return () => {
      hideMainButton();
      hideBackButton();
    };
  }, [sheet]);

  useEffect(() => {
    if (sheet !== 'edit') return;
    if (saving) {
      setTelegramMainButtonLoading(true);
    } else {
      setTelegramMainButtonLoading(false);
      setTelegramMainButtonEnabled(draftName.trim().length >= 2);
    }
  }, [sheet, saving, draftName]);

  const updateAdditionalField = (field, value) => {
    setAdditionalDraft((current) => ({ ...current, [field]: value }));
  };

  const saveAdditionalInfo = async () => {
    setSaving(true);
    setActionError('');
    try {
      const values = Object.fromEntries(
        Object.entries(additionalDraft).map(([key, value]) => [key, typeof value === 'string' ? value.trim() : value]),
      );
      await appData.saveProfile({ additionalInfo: values });
      setSheet(null);
    } catch (error) {
      setActionError(fieldError(error, 'Could not save additional information. Please try again.'));
    } finally {
      setSaving(false);
    }
  };

  const saveSettings = async () => {
    setSaving(true);
    setActionError('');
    try {
      await appData.saveProfile({ settings: { notificationsEnabled } });
      setSheet(null);
    } catch (error) {
      setActionError(fieldError(error, 'Could not save settings. Please try again.'));
    } finally {
      setSaving(false);
    }
  };

  const uploadPhoto = async (file) => {
    if (!file) return;
    setPhotoBusy(true);
    setPhotoError('');
    try {
      await appData.uploadPhoto(file);
    } catch (error) {
      setPhotoError(fieldError(error, 'Photo upload failed. Please try again.'));
    } finally {
      setPhotoBusy(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const removePhoto = async (photoId) => {
    setPhotoBusy(true);
    setPhotoError('');
    try {
      await appData.deletePhoto(photoId);
    } catch (error) {
      setPhotoError(fieldError(error, 'Could not remove this photo. Please try again.'));
    } finally {
      setPhotoBusy(false);
    }
  };

  const movePhoto = async (index, direction) => {
    const next = [...photos];
    const target = index + direction;
    if (target < 0 || target >= next.length) return;
    [next[index], next[target]] = [next[target], next[index]];
    setPhotoBusy(true);
    setPhotoError('');
    try {
      await appData.reorderPhotos(next.map((photo) => photo.id));
    } catch (error) {
      setPhotoError(fieldError(error, 'Could not reorder your photos. Please try again.'));
    } finally {
      setPhotoBusy(false);
    }
  };

  const requestScore = async () => {
    setScoreBusy(true);
    setActionError('');
    try {
      await appData.requestProfileScore();
    } catch (error) {
      setActionError(fieldError(error, 'Could not calculate your profile score. Please try again.'));
    } finally {
      setScoreBusy(false);
    }
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
          {visiblePhoto ? <img src={visiblePhoto} alt="" /> : <span>{initials(user, displayName)}</span>}
          {(profile.verificationStatus === 'verified' || profile.isVerified)
            && <span className="profile-avatar__badge"><VerifiedBadge size={22} /></span>}
        </div>
        <h1>{displayName.toUpperCase()}</h1>
        <p className="profile-meta">
          <strong>{profile.age ?? answers.age ?? ''}</strong>
          {[profile.city || answers.location?.name || 'Addis Ababa', profile.country || answers.location?.country || 'Ethiopia']
            .filter(Boolean).join(', ')}
        </p>
      </header>

      <section className="profile-photos" aria-label="Profile photos">
        <div className="profile-photos__heading">
          <div><h3>Your photos</h3><small>Choose up to six; the first photo is your primary photo.</small></div>
          <span>{photos.length}/6</span>
        </div>
        {photos.length > 0 && (
          <div className="profile-photos__grid">
            {photos.map((photo, index) => (
              <figure className={`profile-photo${photo.isPrimary ? ' profile-photo--primary' : ''}`} key={photo.id}>
                <img src={photo.url} alt={`Profile photo ${index + 1}`} />
                {photo.isPrimary && <figcaption>Primary</figcaption>}
                <div className="profile-photo__controls">
                  <button type="button" aria-label={`Move photo ${index + 1} earlier`} disabled={photoBusy || index === 0} onClick={() => movePhoto(index, -1)}>‹</button>
                  <button type="button" aria-label={`Move photo ${index + 1} later`} disabled={photoBusy || index === photos.length - 1} onClick={() => movePhoto(index, 1)}>›</button>
                  <button type="button" aria-label={`Delete photo ${index + 1}`} disabled={photoBusy} onClick={() => removePhoto(photo.id)}>×</button>
                </div>
              </figure>
            ))}
          </div>
        )}
        <input
          ref={fileInputRef}
          className="visually-hidden"
          type="file"
          accept="image/jpeg,image/png,image/webp"
          onChange={(event) => uploadPhoto(event.target.files?.[0])}
        />
        {photos.length < 6 && (
          <button type="button" className="photo-add-button" disabled={photoBusy} onClick={() => fileInputRef.current?.click()}>
            {photoBusy ? 'Saving photo…' : '+ Add a photo'}
          </button>
        )}
        <small className="profile-photos__hint">JPG, PNG, or WebP · maximum 5 MB each</small>
        {photoError && <p className="field-error" role="alert">{photoError}</p>}
      </section>

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
        <SettingRow icon="👤" label="Edit profile" onClick={() => {
          setDraftName(profile.name || displayName);
          setDraftBio(profile.bio || user.bio || '');
          setDraftCity(profile.city || answers.location?.name || user.city || '');
          setDraftCountry(profile.country || answers.location?.country || user.country || '');
          setActionError('');
          setSheet('edit');
        }} />
        <SettingRow icon="📄" label="Additional info" onClick={() => {
          setAdditionalDraft(profile.additionalInfo || {});
          setActionError('');
          setSheet('info');
        }} />
        <SettingRow icon="🤖" label="AI profile score" onClick={() => {
          setActionError('');
          setSheet('score');
          appData.refreshProfileScore().catch((error) => console.warn('Could not load profile score:', error));
        }} />
        <SettingRow icon="🔍" label="Looking for" onClick={() => setSheet('looking')} />
        <SettingRow icon="⚙️" label="Settings" onClick={() => {
          setNotificationsEnabled(profile.settings?.notificationsEnabled !== false);
          setActionError('');
          setSheet('settings');
        }} />
      </section>

      <section className="settings-group" aria-label="Support">
        <h3>Support</h3>
        <SettingRow icon="➤" label="Contact support" onClick={() => setSheet('support')} />
        <SettingRow icon="❓" label="FAQ" onClick={() => setSheet('faq')} />
        <SettingRow icon="📄" label="Privacy policy" onClick={() => setSheet('privacy')} />
      </section>

      {sheet && (
        <div className="sheet-backdrop" role="presentation" onClick={() => { setSheet(null); setActionError(''); }}>
          <div className="sheet" role="dialog" aria-modal="true" onClick={(event) => event.stopPropagation()}>
            <button type="button" className="icon-button sheet__close" aria-label="Close" onClick={() => { setSheet(null); setActionError(''); }}>
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
                <label className="promo-field">
                  <span>Bio</span>
                  <textarea rows="3" value={draftBio} maxLength={500} placeholder="A line or two that makes you, you" onChange={(event) => setDraftBio(event.target.value)} />
                </label>
                <label className="promo-field">
                  <span>City</span>
                  <input type="text" value={draftCity} maxLength={120} onChange={(event) => setDraftCity(event.target.value)} />
                </label>
                <label className="promo-field">
                  <span>Country</span>
                  <input type="text" value={draftCountry} maxLength={120} onChange={(event) => setDraftCountry(event.target.value)} />
                </label>
                {actionError && <p className="field-error" role="alert">{actionError}</p>}
                <button type="button" className="onboarding-primary" onClick={() => void saveEdit()} disabled={saving || draftName.trim().length < 2}>
                  {saving ? 'SAVING…' : 'SAVE PROFILE'}
                </button>
                <small className="telegram-button-hint">You can also save with Telegram’s native button below.</small>
              </>
            )}

            {sheet === 'info' && (
              <>
                <h2>Additional info</h2>
                <p className="profile-form-note">Share a little more about yourself. These details stay on your profile.</p>
                {[
                  ['occupation', 'What do you do?'],
                  ['education', 'Education'],
                  ['languages', 'Languages'],
                  ['interests', 'Interests'],
                ].map(([key, label]) => (
                  <label className="promo-field" key={key}>
                    <span>{label}</span>
                    <input
                      type="text"
                      maxLength={160}
                      value={typeof additionalDraft[key] === 'string' ? additionalDraft[key] : ''}
                      onChange={(event) => updateAdditionalField(key, event.target.value)}
                    />
                  </label>
                ))}
                {actionError && <p className="field-error" role="alert">{actionError}</p>}
                <button type="button" className="onboarding-primary" onClick={saveAdditionalInfo} disabled={saving}>
                  {saving ? 'SAVING…' : 'SAVE'}
                </button>
              </>
            )}

            {sheet === 'score' && (
              <>
                <h2>Profile score</h2>
                {profile.profileScoreReady && profile.profileScore != null ? (
                  <div className="profile-score-result">
                    <strong>{profile.profileScore}</strong><span>/100</span>
                    <p>Your profile score is ready.</p>
                  </div>
                ) : (
                  <>
                    <div className="score-loader" aria-hidden="true"><span /></div>
                    <p className="score-learning">Your score is ready to calculate</p>
                    <p className="score-note">Get a quick view of your profile’s match potential.</p>
                    {actionError && <p className="field-error" role="alert">{actionError}</p>}
                    <button type="button" className="onboarding-primary score-button" onClick={requestScore} disabled={scoreBusy}>
                      {scoreBusy ? 'CALCULATING…' : 'Find out the score'}
                    </button>
                  </>
                )}
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

            {sheet === 'settings' && (
              <>
                <h2>Settings</h2>
                <p className="profile-form-note">Choose which Dategram activity can send a Telegram message.</p>
                <label className="settings-toggle">
                  <span><strong>Chat notifications</strong><small>Get a bot message when someone writes while you’re offline.</small></span>
                  <input type="checkbox" checked={notificationsEnabled} onChange={(event) => setNotificationsEnabled(event.target.checked)} />
                </label>
                {actionError && <p className="field-error" role="alert">{actionError}</p>}
                <button type="button" className="onboarding-primary" onClick={saveSettings} disabled={saving}>
                  {saving ? 'SAVING…' : 'SAVE SETTINGS'}
                </button>
              </>
            )}

            {sheet === 'support' && (
              <>
                <h2>Contact support</h2>
                <p>Need help with your profile, a match, or a safety concern? Message us on Telegram and we’ll get back to you.</p>
                <a className="support-link" href="https://t.me/DategramAppBot" target="_blank" rel="noreferrer">Message @DategramAppBot</a>
              </>
            )}

            {sheet === 'faq' && (
              <>
                <h2>FAQ</h2>
                <dl className="faq-list">
                  <div><dt>Is Dategram free?</dt><dd>Yes. VIP adds free direct messages and visibility perks.</dd></div>
                  <div><dt>How do matches work?</dt><dd>You match when both sides like each other. Messaging always requires a match.</dd></div>
                  <div><dt>How do I get verified?</dt><dd>Tap Get verified on your profile and follow the Telegram verification flow.</dd></div>
                  <div><dt>How do I change my photos?</dt><dd>Use the photo controls on your profile to add, remove, or reorder up to six photos.</dd></div>
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
