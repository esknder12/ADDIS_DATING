import { useCallback, useEffect, useRef, useState } from 'react';
import { impact, notify } from '../../lib/telegram.js';

const REVEAL_THRESHOLD = 0.45;

/** R6 — Scratch-to-reveal discount with a tap/keyboard alternative. */
export default function ScratchScreen({ step, saving, error, onRedeem, onContinue }) {
  const canvasRef = useRef(null);
  const scratchingRef = useRef(false);
  const [revealed, setRevealed] = useState(false);
  const [scratchProgress, setScratchProgress] = useState(0);

  // Paint the opaque cover layer.
  useEffect(() => {
    if (revealed) return undefined;
    const canvas = canvasRef.current;
    if (!canvas) return undefined;

    const paintCover = () => {
      const parent = canvas.parentElement;
      if (!parent || parent.clientWidth === 0) return false;
      const ratio = window.devicePixelRatio || 1;
      canvas.width = parent.clientWidth * ratio;
      canvas.height = parent.clientHeight * ratio;
      const context = canvas.getContext('2d');
      context.scale(ratio, ratio);
      const gradient = context.createLinearGradient(0, 0, parent.clientWidth, parent.clientHeight);
      gradient.addColorStop(0, '#2b2b30');
      gradient.addColorStop(0.5, '#3a3a41');
      gradient.addColorStop(1, '#26262b');
      context.fillStyle = gradient;
      context.fillRect(0, 0, parent.clientWidth, parent.clientHeight);
      // Subtle texture dots.
      context.fillStyle = 'rgba(255,255,255,0.05)';
      for (let index = 0; index < 260; index += 1) {
        const x = Math.random() * parent.clientWidth;
        const y = Math.random() * parent.clientHeight;
        context.fillRect(x, y, 2, 2);
      }
      context.textAlign = 'center';
      context.textBaseline = 'middle';
      context.fillStyle = 'rgba(255,255,255,0.5)';
      context.font = '600 15px Inter, system-ui, sans-serif';
      context.fillText('Scratch it off', parent.clientWidth / 2, parent.clientHeight / 2);
      return true;
    };

    if (!paintCover()) {
      const retry = window.setTimeout(paintCover, 120);
      return () => window.clearTimeout(retry);
    }
    return undefined;
  }, [revealed]);

  const measureProgress = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return 0;
    const context = canvas.getContext('2d');
    const { width, height } = canvas;
    if (!width || !height) return 0;
    const pixels = context.getImageData(0, 0, width, height).data;
    let cleared = 0;
    const stride = 16 * 4; // sample every 16th pixel
    for (let index = 3; index < pixels.length; index += stride) {
      if (pixels[index] === 0) cleared += 1;
    }
    return cleared / (pixels.length / stride);
  }, []);

  const scratchAt = useCallback((event) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const bounds = canvas.getBoundingClientRect();
    const context = canvas.getContext('2d');
    const ratio = window.devicePixelRatio || 1;
    context.globalCompositeOperation = 'destination-out';
    context.beginPath();
    context.arc(
      (event.clientX - bounds.left) * ratio,
      (event.clientY - bounds.top) * ratio,
      30 * ratio,
      0,
      Math.PI * 2,
    );
    context.fill();
    impact('light');

    const cleared = measureProgress();
    setScratchProgress(cleared);
    if (cleared >= REVEAL_THRESHOLD) setRevealed(true);
  }, [measureProgress]);

  const handlePointerDown = useCallback((event) => {
    scratchingRef.current = true;
    event.currentTarget.setPointerCapture?.(event.pointerId);
    scratchAt(event);
  }, [scratchAt]);

  const handlePointerMove = useCallback((event) => {
    if (scratchingRef.current) scratchAt(event);
  }, [scratchAt]);

  const handlePointerUp = useCallback(() => {
    scratchingRef.current = false;
  }, []);

  const revealNow = useCallback(() => {
    setRevealed(true);
    notify('success');
  }, []);

  useEffect(() => {
    if (revealed) notify('success');
  }, [revealed]);

  return (
    <main className="results-screen results-screen--pad">
      <h1 className="results-heading results-heading--center">{step.heading}</h1>
      <p className="results-subheading">{step.subheading}</p>

      <div className={`scratch-card${revealed ? ' scratch-card--revealed' : ''}`}>
        <div className="scratch-card__prize" aria-hidden={!revealed}>
          <strong className="scratch-card__percent">{step.percent}%</strong>
          <span>discount</span>
          <small>on your Premium</small>
          <div className="scratch-card__code">
            <span>Promo code</span>
            <code>{step.promoCode}</code>
          </div>
          <p className="scratch-card__applied"><span aria-hidden="true">✅</span> Applied automatically at checkout</p>
        </div>
        {!revealed && (
          <canvas
            ref={canvasRef}
            className="scratch-card__canvas"
            aria-hidden="true"
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
            onPointerCancel={handlePointerUp}
          />
        )}
      </div>
      {!revealed && (
        <div className="scratch-meta">
          <span className="scratch-meta__hand" aria-hidden="true">👆</span>
          <span className="scratch-divider" aria-hidden="true" />
          <button type="button" className="secondary-link" onClick={revealNow}>
            Tap to reveal instead
          </button>
          {scratchProgress > 0.05 && (
            <span className="scratch-progress-note">{Math.round((scratchProgress / REVEAL_THRESHOLD) * 100)}% revealed</span>
          )}
        </div>
      )}

      {error && <p className="field-error" role="alert">{error}</p>}

      <button
        type="button"
        className="onboarding-primary results-cta"
        disabled={!revealed || saving}
        onClick={() => onRedeem().then((ok) => { if (ok) onContinue(); })}
      >
        {revealed ? step.cta : 'SCRATCH TO CONTINUE'}
      </button>
    </main>
  );
}
