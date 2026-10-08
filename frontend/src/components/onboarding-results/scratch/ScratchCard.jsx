import useScratchReveal from './useScratchReveal.js';

export default function ScratchCard({
  children,
  coverText = 'Scratch it off',
  threshold = 0.6,
  onRevealComplete,
}) {
  const { canvasRef, revealed, progress, handlers, revealAll } = useScratchReveal({
    threshold,
    onRevealComplete,
  });

  const percent = Math.round(progress * 100);

  return (
    <div className={`scratch-card${revealed ? ' is-revealed' : ''}`}>
      <div className="scratch-card__prize" aria-hidden={!revealed}>
        {children}
      </div>

      <canvas ref={canvasRef} className="scratch-card__cover" {...handlers} role="presentation" />

      {!revealed ? (
        <div className="scratch-card__prompt" aria-hidden="true">
          <span className="scratch-card__hand">✋</span>
          <strong>{coverText}</strong>
          <small>{`${percent}% revealed`}</small>
        </div>
      ) : null}

      <div className="scratch-card__a11y">
        <p className="sr-only" role="status" aria-live="polite">
          {revealed
            ? 'Discount revealed.'
            : `Scratch card covered, ${percent}% revealed. Use the reveal button if you cannot scratch.`}
        </p>
        {!revealed ? (
          <button type="button" className="scratch-reveal-button" onClick={revealAll}>
            Reveal my discount
          </button>
        ) : null}
      </div>
    </div>
  );
}
