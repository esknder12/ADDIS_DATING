function Checkmark({ radio = false }) {
  return (
    <span className={`option-check ${radio ? 'option-check--radio' : ''}`} aria-hidden="true">
      <svg viewBox="0 0 20 20"><path d="m5 10.2 3.1 3.1L15.4 6" /></svg>
    </span>
  );
}

export function EnergyGlyph({ level = 2 }) {
  return (
    <span className="energy-glyph" aria-hidden="true">
      {[1, 2, 3, 4].map((line) => (
        <span key={line} className={line <= level ? 'is-active' : ''} />
      ))}
    </span>
  );
}

export function SingleOption({ option, selected, onSelect, layout }) {
  return (
    <button
      type="button"
      className={`answer-option ${selected ? 'is-selected' : ''} ${layout === 'gender' ? 'answer-option--gender' : ''}`}
      onClick={() => onSelect(option.id)}
      aria-pressed={selected}
    >
      {option.icon && <span className="answer-option__icon">{option.icon}</span>}
      {option.energy && <EnergyGlyph level={option.energy} />}
      <span className="answer-option__copy">
        <strong>{option.label}</strong>
        {option.description && <small>{option.description}</small>}
      </span>
      {selected && <Checkmark radio />}
    </button>
  );
}

export function MultiOption({ option, selected, onToggle }) {
  return (
    <button
      type="button"
      className={`answer-option answer-option--multi ${selected ? 'is-selected' : ''}`}
      onClick={() => onToggle(option.id)}
      aria-pressed={selected}
    >
      {option.icon && <span className="answer-option__icon">{option.icon}</span>}
      <span className="answer-option__copy">
        <strong>{option.label}</strong>
        {option.description && <small>{option.description}</small>}
      </span>
      <Checkmark />
    </button>
  );
}

export function ImageOption({ option, selected, onToggle }) {
  const style = option.image ? { backgroundImage: `url(${option.image})` } : undefined;
  return (
    <button
      type="button"
      className={`image-option image-option--${option.tone || 'photo'} ${selected ? 'is-selected' : ''}`}
      onClick={() => onToggle(option.id)}
      aria-pressed={selected}
    >
      <span className={`image-option__visual image-crop--${option.crop || 'center'}`} style={style}>
        {option.visualIcon && <span className="image-option__symbol">{option.visualIcon}</span>}
      </span>
      <span className="image-option__scrim" />
      <strong>{option.label}</strong>
      <Checkmark />
    </button>
  );
}

export function ThumbnailOption({ option, selected, onToggle }) {
  return (
    <button
      type="button"
      className={`thumbnail-option ${selected ? 'is-selected' : ''}`}
      onClick={() => onToggle(option.id)}
      aria-pressed={selected}
    >
      <Checkmark />
      <strong>{option.label}</strong>
      <span
        className={`thumbnail-option__image image-crop--${option.crop || 'center'}`}
        style={{ backgroundImage: `url(${option.thumbnail})` }}
      />
    </button>
  );
}
