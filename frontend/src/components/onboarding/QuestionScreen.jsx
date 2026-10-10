import { useEffect, useMemo, useRef, useState } from 'react';
import {
  locationSuggestions,
  validateOnboardingAnswer,
} from '@dategram/shared/onboarding';
import { impact } from '../../lib/telegram.js';
import {
  ImageOption,
  MultiOption,
  SingleOption,
  ThumbnailOption,
} from './OptionControls.jsx';
import MatchPreviewCard from './MatchPreviewCard.jsx';
import PhotoUploadInput from './PhotoUploadInput.jsx';
import QuestionHeader from './QuestionHeader.jsx';

function initialValue(step, savedAnswer) {
  if (step.input === 'multi') return Array.isArray(savedAnswer) ? savedAnswer : [];
  if (step.input === 'photos') return Array.isArray(savedAnswer) ? savedAnswer : [];
  if (step.input === 'text') return typeof savedAnswer === 'string' ? savedAnswer : '';
  if (step.input === 'number') {
    return typeof savedAnswer === 'number' || typeof savedAnswer === 'string'
      ? savedAnswer
      : '';
  }
  if (step.input === 'location') {
    return savedAnswer && typeof savedAnswer === 'object' && !Array.isArray(savedAnswer)
      ? savedAnswer
      : null;
  }
  return typeof savedAnswer === 'string' ? savedAnswer : '';
}

function filterLocations(query) {
  const normalized = query.trim().toLocaleLowerCase();
  if (!normalized) {
    const defaults = ['tokyo-jp', 'cairo-eg', 'hong-kong-hk', 'singapore-sg'];
    return defaults.map((id) => locationSuggestions.find((city) => city.id === id));
  }
  return locationSuggestions
    .filter((city) => `${city.name} ${city.country}`.toLocaleLowerCase().includes(normalized))
    .slice(0, 5);
}

function ManualFooter({ disabled, saving, onClick }) {
  return (
    <div className="question-footer">
      <button
        type="button"
        className="onboarding-primary"
        disabled={disabled || saving}
        onClick={onClick}
      >
        {saving ? <span className="button-spinner" aria-label="Saving" /> : 'NEXT STEP'}
      </button>
    </div>
  );
}

function StandardOptions({ step, value, setValue, submitSingle }) {
  function toggle(optionId) {
    impact('light');
    setValue((current) => {
      if (step.exclusiveOption && optionId === step.exclusiveOption) {
        return current.includes(optionId) ? [] : [optionId];
      }
      const withoutExclusive = current.filter((id) => id !== step.exclusiveOption);
      return withoutExclusive.includes(optionId)
        ? withoutExclusive.filter((id) => id !== optionId)
        : [...withoutExclusive, optionId];
    });
  }

  if (step.layout === 'image-grid') {
    return (
      <div className="image-option-grid">
        {step.options.map((option) => (
          <ImageOption
            key={option.id}
            option={option}
            selected={value.includes(option.id)}
            onToggle={toggle}
          />
        ))}
      </div>
    );
  }

  if (step.layout === 'thumbnail-list') {
    return (
      <div className="thumbnail-options">
        {step.options.map((option) => (
          <ThumbnailOption
            key={option.id}
            option={option}
            selected={value.includes(option.id)}
            onToggle={toggle}
          />
        ))}
      </div>
    );
  }

  if (step.layout === 'categorized') {
    return (
      <div className="categorized-options">
        {step.groups.map((group) => (
          <section key={group.label}>
            <h2>{group.label}</h2>
            <div className="answer-options">
              {group.options.map((option) => (
                <MultiOption
                  key={option.id}
                  option={option}
                  selected={value.includes(option.id)}
                  onToggle={toggle}
                />
              ))}
            </div>
          </section>
        ))}
      </div>
    );
  }

  const isMulti = step.input === 'multi';
  return (
    <div className={`answer-options answer-options--${step.layout}`}>
      {step.options.map((option) => (
        isMulti ? (
          <MultiOption
            key={option.id}
            option={option}
            selected={value.includes(option.id)}
            onToggle={toggle}
          />
        ) : (
          <SingleOption
            key={option.id}
            option={option}
            layout={step.layout}
            selected={value === option.id}
            onSelect={submitSingle}
          />
        )
      ))}
    </div>
  );
}

function TextInput({ step, value, onChange }) {
  const maxLength = step.maxLength ?? 500;
  return (
    <div className="bio-field">
      <label>
        <span className="sr-only">{step.title}</span>
        <textarea
          value={value}
          onChange={(event) => onChange(event.target.value.slice(0, maxLength))}
          placeholder={step.placeholder || 'Write something about yourself...'}
          rows={5}
          maxLength={maxLength}
          autoFocus
        />
      </label>
      <span className="bio-count" aria-live="polite">{value.length}/{maxLength}</span>
    </div>
  );
}

function LocationInput({ gender, value, onChange }) {
  const lookingForNoun = gender === 'female' ? 'men' : 'women';
  const [query, setQuery] = useState(value ? `${value.name}, ${value.country}` : '');
  const suggestions = useMemo(() => filterLocations(query), [query]);

  function updateQuery(event) {
    setQuery(event.target.value);
    onChange(null);
  }

  function choose(city) {
    impact('light');
    onChange(city);
    setQuery(`${city.name}, ${city.country}`);
  }

  return (
    <div className="location-field">
      <label className="location-search">
        <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="6.5" /><path d="m16 16 4 4" /></svg>
        <input
          value={query}
          onChange={updateQuery}
          placeholder="Search for your city"
          autoComplete="off"
          autoFocus
        />
        {query && (
          <button
            type="button"
            aria-label="Clear location"
            onClick={() => {
              setQuery('');
              onChange(null);
            }}
          >×</button>
        )}
      </label>

      {!value && (
        <div className="location-suggestions" role="listbox" aria-label="City suggestions">
          {suggestions.length > 0 ? suggestions.map((city) => (
            <button key={city.id} type="button" onClick={() => choose(city)}>
              <span className="location-pin">⌖</span>
              <span><strong>{city.name}</strong><small>{city.region}, {city.country}</small></span>
              <span className="location-chevron">›</span>
            </button>
          )) : (
            <p>No matching city yet. Try “Addis”.</p>
          )}
        </div>
      )}

      {value && (
        <div className="location-confirmation">
          <span className="location-confirmation__icon">⌖</span>
          <div>
            <strong>11 {lookingForNoun} active in {value.name} this week</strong>
            <p>Most of them replied to a message in the last 24 hours.</p>
          </div>
        </div>
      )}
    </div>
  );
}

function NumberInput({ gender, step, value, onChange }) {
  const numericValue = Number(value);
  const valid = Number.isInteger(numericValue) && numericValue >= step.min && numericValue <= step.max;
  const isFemale = gender === 'female';

  return (
    <div className="age-field">
      <label>
        <span className="sr-only">Your age in years</span>
        <input
          type="number"
          inputMode="numeric"
          min={step.min}
          max={step.max}
          value={value}
          onChange={(event) => onChange(event.target.value.slice(0, 3))}
          placeholder="Age"
          autoFocus
        />
        <span>{step.suffix}</span>
      </label>
      <p className="age-note">{step.note}</p>
      {valid && (
        <div className="age-insight">
          <span>✓</span>
          <div>
            <strong>
              {isFemale
                ? 'Great news: men 25–34 are the most active group here'
                : 'Great news: women 25–34 are the most active group here'}
            </strong>
            <p>
              {isFemale
                ? 'Women your age get 2.3× more replies than the average.'
                : 'Men your age get 2.3× more replies than the average.'}
            </p>
          </div>
        </div>
      )}
    </div>
  );
}

export default function QuestionScreen({ step, user, gender, savedAnswer, onSubmit, saving, error }) {
  const [value, setValue] = useState(() => initialValue(step, savedAnswer));
  const [selectionPending, setSelectionPending] = useState(false);
  const timerRef = useRef(null);

  useEffect(() => () => window.clearTimeout(timerRef.current), []);

  async function submitSingle(optionId) {
    if (saving || selectionPending) return;
    impact('light');
    setValue(optionId);
    setSelectionPending(true);
    timerRef.current = window.setTimeout(async () => {
      const submitted = await onSubmit(optionId);
      if (!submitted) setSelectionPending(false);
    }, 260);
  }

  async function submitManual() {
    if (saving) return;
    impact('medium');
    const answer = step.input === 'number' ? Number(value) : value;
    await onSubmit(answer);
  }

  const validation = validateOnboardingAnswer(
    step.key,
    step.input === 'number' ? Number(value) : value,
  );
  const manual = step.input !== 'single';

  return (
    <section className={`question-screen question-screen--${step.layout}`}>
      <div className="question-scroll">
        <QuestionHeader step={step} />

        {step.layout === 'hero-grid' && (
          <div className="question-hero" style={{ backgroundImage: `url(${step.heroImage})` }}>
            <span>DATE IDEA</span>
          </div>
        )}

        {step.layout === 'split-photo' && (
          <div className="split-photo-accent" style={{ backgroundImage: `url(${step.sideImage})` }} aria-hidden="true" />
        )}

        {step.input === 'number' ? (
          <NumberInput gender={gender} step={step} value={value} onChange={setValue} />
        ) : step.input === 'location' ? (
          <LocationInput gender={gender} value={value} onChange={setValue} />
        ) : step.input === 'photos' ? (
          <PhotoUploadInput
            step={step}
            value={value}
            onChange={setValue}
            isDemo={user?.isDemo !== false}
          />
        ) : step.input === 'text' ? (
          <TextInput step={step} value={value} onChange={setValue} />
        ) : (
          <StandardOptions
            step={step}
            value={value}
            setValue={setValue}
            submitSingle={submitSingle}
          />
        )}

        {(step.banner?.image || step.banner?.visual) && (
          <figure className="question-banner">
            <figcaption>
              {step.banner.eyebrow && (
                <span className="question-banner__eyebrow">{step.banner.eyebrow}</span>
              )}
              {step.banner.title && <strong>{step.banner.title}</strong>}
              {step.banner.body && <span>{step.banner.body}</span>}
            </figcaption>
            {step.banner.visual === 'match-preview' ? (
              <MatchPreviewCard gender={gender} />
            ) : (
              <img src={step.banner.image} alt={step.banner.imageAlt || ''} />
            )}
          </figure>
        )}

        {error && <p className="onboarding-error" role="alert">{error}</p>}
      </div>

      {manual && (
        <ManualFooter
          disabled={!validation.valid}
          saving={saving}
          onClick={submitManual}
        />
      )}
    </section>
  );
}
