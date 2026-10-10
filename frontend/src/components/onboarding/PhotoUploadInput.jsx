import { useRef, useState } from 'react';
import { deleteProfilePhoto, uploadProfilePhoto } from '../../api/client.js';
import { impact } from '../../lib/telegram.js';

const ACCEPTED_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
const MAX_FILE_BYTES = 5 * 1024 * 1024;
const MIN_SIDE_PX = 200;
const DEMO_MAX_SIDE_PX = 720;

function urlOf(photo) {
  return typeof photo === 'string' ? photo : photo?.url || '';
}

function idOf(photo) {
  return typeof photo === 'object' && photo !== null ? photo.id : undefined;
}

function loadImage(source) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error('unreadable'));
    image.src = source;
  });
}

function readAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(new Error('unreadable'));
    reader.readAsDataURL(file);
  });
}

/** Downscale demo uploads so they stay small enough for localStorage. */
async function compressForDemo(file) {
  const source = await readAsDataUrl(file);
  const image = await loadImage(source);
  const scale = Math.min(1, DEMO_MAX_SIDE_PX / Math.max(image.width, image.height));
  const width = Math.max(1, Math.round(image.width * scale));
  const height = Math.max(1, Math.round(image.height * scale));
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  canvas.getContext('2d').drawImage(image, 0, 0, width, height);
  return canvas.toDataURL('image/jpeg', 0.72);
}

function ModerationModal({ onClose }) {
  return (
    <div className="moderation-overlay" role="alertdialog" aria-modal="true" aria-labelledby="moderation-title">
      <div className="moderation-card">
        <button type="button" className="moderation-close" aria-label="Close" onClick={onClose}>×</button>
        <span className="moderation-icon" aria-hidden="true">
          <svg viewBox="0 0 24 24"><rect x="3" y="4" width="18" height="14" rx="2" /><circle cx="9" cy="10" r="1.6" /><path d="m5 17 5-4 3 3 3-3 3 4" /></svg>
          <b>!</b>
        </span>
        <h2 id="moderation-title">This photo didn&apos;t pass moderation</h2>
        <p>Please upload a different one. The right photo is one where:</p>
        <ul>
          <li><span aria-hidden="true">✓</span> Your face is clearly visible</li>
          <li><span aria-hidden="true">✓</span> You&apos;re the only person in the foreground</li>
          <li><span aria-hidden="true">✓</span> There&apos;s no nudity, insults, threats or other prohibited content</li>
        </ul>
        <button type="button" className="moderation-dismiss" onClick={onClose}>Got it</button>
      </div>
    </div>
  );
}

/**
 * Onboarding photo step: one interface, four states per the product shots —
 * empty (+) → uploading (spinner) → moderation modal on rule violations →
 * uploaded grid (main photo + extra slots, remove with ×).
 */
export default function PhotoUploadInput({ step, value, onChange, isDemo }) {
  const photos = Array.isArray(value) ? value : [];
  const maxPhotos = step.maxPhotos ?? 3;
  const fileRef = useRef(null);
  const [uploading, setUploading] = useState(false);
  const [showModeration, setShowModeration] = useState(false);
  const [uploadError, setUploadError] = useState('');

  function openPicker() {
    if (uploading || photos.length >= maxPhotos) return;
    impact('light');
    setUploadError('');
    fileRef.current?.click();
  }

  async function addFile(file) {
    if (!file) return;
    if (!ACCEPTED_TYPES.includes(file.type) || file.size > MAX_FILE_BYTES) {
      impact('heavy');
      setShowModeration(true);
      return;
    }

    setUploading(true);
    setUploadError('');
    try {
      if (isDemo) {
        const dataUrl = await compressForDemo(file);
        const probe = await loadImage(dataUrl);
        if (probe.width < MIN_SIDE_PX || probe.height < MIN_SIDE_PX) {
          setShowModeration(true);
          return;
        }
        impact('medium');
        onChange([...photos, { url: dataUrl }]);
        return;
      }

      const objectUrl = window.URL.createObjectURL(file);
      try {
        const probe = await loadImage(objectUrl);
        if (probe.width < MIN_SIDE_PX || probe.height < MIN_SIDE_PX) {
          impact('heavy');
          setShowModeration(true);
          return;
        }
      } finally {
        window.URL.revokeObjectURL(objectUrl);
      }

      const response = await uploadProfilePhoto(file);
      impact('medium');
      onChange([...photos, { id: response.photo?.id, url: response.photo?.url }]);
    } catch (error) {
      const code = error.response?.data?.error?.code;
      if (code === 'INVALID_PHOTO_TYPE' || code === 'PHOTO_TOO_LARGE') {
        impact('heavy');
        setShowModeration(true);
      } else {
        impact('heavy');
        setUploadError(
          error.response?.data?.error?.message
          || 'Photo upload failed. Please try again.',
        );
      }
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  }

  async function removePhoto(index) {
    impact('light');
    const target = photos[index];
    const targetId = idOf(target);
    onChange(photos.filter((_, position) => position !== index));
    if (!isDemo && targetId !== undefined) {
      try {
        await deleteProfilePhoto(targetId);
      } catch {
        // The onboarding answer is the source of truth; a stale profile row
        // is harmless and can be removed later from the profile screen.
      }
    }
  }

  const slots = [];
  for (let index = 0; index < maxPhotos; index += 1) {
    const photo = photos[index];
    if (photo && urlOf(photo)) {
      slots.push({ kind: 'photo', photo, index });
    } else if (index === photos.length && uploading) {
      slots.push({ kind: 'uploading', index });
    } else if (index >= photos.length && photos.length < maxPhotos) {
      slots.push({ kind: 'empty', index });
    }
  }

  const showSingleBox = photos.length === 0 && !uploading;

  return (
    <div className="photo-upload">
      <input
        ref={fileRef}
        type="file"
        className="sr-only"
        accept={ACCEPTED_TYPES.join(',')}
        aria-label="Choose a photo"
        onChange={(event) => addFile(event.target.files?.[0])}
      />

      {showSingleBox ? (
        <button type="button" className="photo-box photo-box--single" onClick={openPicker}>
          <span className="photo-main-tag">Main photo</span>
          <span className="photo-plus" aria-hidden="true">+</span>
        </button>
      ) : (
        <div className="photo-grid">
          {slots.map((slot) => {
            if (slot.kind === 'photo') {
              const main = slot.index === 0;
              return (
                <div
                  key={`photo-${slot.index}`}
                  className={`photo-cell${main ? ' photo-cell--main' : ''}`}
                >
                  <img src={urlOf(slot.photo)} alt={main ? 'Main photo' : `Photo ${slot.index + 1}`} />
                  {main && <span className="photo-main-tag">Main photo</span>}
                  <button
                    type="button"
                    className="photo-remove"
                    aria-label={`Remove photo ${slot.index + 1}`}
                    onClick={() => removePhoto(slot.index)}
                  >
                    ×
                  </button>
                </div>
              );
            }
            if (slot.kind === 'uploading') {
              return (
                <div key={`uploading-${slot.index}`} className="photo-cell photo-cell--busy">
                  {slot.index === 0 && <span className="photo-main-tag">Main photo</span>}
                  <span className="photo-spinner" aria-label="Uploading photo" />
                </div>
              );
            }
            return (
              <button
                key={`empty-${slot.index}`}
                type="button"
                className="photo-cell photo-cell--empty"
                onClick={openPicker}
                aria-label="Add another photo"
              >
                <span className="photo-plus" aria-hidden="true">+</span>
              </button>
            );
          })}
        </div>
      )}

      <p className="photo-hint">JPG, PNG or WebP · max 5 MB · face clearly visible</p>
      {uploadError && <p className="onboarding-error" role="alert">{uploadError}</p>}
      {showModeration && <ModerationModal onClose={() => setShowModeration(false)} />}
    </div>
  );
}
