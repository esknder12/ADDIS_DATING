import { useCallback, useEffect, useRef, useState } from 'react';

// Low-resolution mask: cheap to sample, scaled up by CSS, invisible at brush size.
const MASK_WIDTH = 64;
const MASK_HEIGHT = 40;
const SAMPLE_EVERY_N_STROKES = 6;

function prefersReducedMotion() {
  return typeof window.matchMedia === 'function'
    && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

export default function useScratchReveal({ threshold = 0.6, onRevealComplete }) {
  const canvasRef = useRef(null);
  const contextRef = useRef(null);
  const drawingRef = useRef(false);
  const lastPointRef = useRef(null);
  const strokesRef = useRef(0);
  const completedRef = useRef(false);
  const onCompleteRef = useRef(onRevealComplete);

  const [revealed, setRevealed] = useState(false);
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    onCompleteRef.current = onRevealComplete;
  }, [onRevealComplete]);

  const paintCover = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    canvas.width = MASK_WIDTH;
    canvas.height = MASK_HEIGHT;
    const context = canvas.getContext('2d', { willReadFrequently: true });
    if (!context) return;

    contextRef.current = context;
    context.globalCompositeOperation = 'source-over';
    context.fillStyle = '#2a2a2a';
    context.fillRect(0, 0, MASK_WIDTH, MASK_HEIGHT);

    // Subtle texture so the cover reads as a scratchable surface rather than a flat block.
    context.fillStyle = 'rgba(255, 255, 255, 0.05)';
    for (let x = 0; x < MASK_WIDTH; x += 4) {
      for (let y = 0; y < MASK_HEIGHT; y += 4) {
        if ((x + y) % 8 === 0) context.fillRect(x, y, 2, 2);
      }
    }

    context.globalCompositeOperation = 'destination-out';
    context.lineCap = 'round';
    context.lineJoin = 'round';
    context.lineWidth = 6;
  }, []);

  useEffect(() => {
    paintCover();
  }, [paintCover]);

  const measureCleared = useCallback(() => {
    const context = contextRef.current;
    if (!context) return 0;

    const { data } = context.getImageData(0, 0, MASK_WIDTH, MASK_HEIGHT);
    let cleared = 0;
    for (let index = 3; index < data.length; index += 4) {
      if (data[index] < 128) cleared += 1;
    }
    return cleared / (MASK_WIDTH * MASK_HEIGHT);
  }, []);

  const finish = useCallback(() => {
    if (completedRef.current) return;
    completedRef.current = true;
    setProgress(1);
    setRevealed(true);
    if (onCompleteRef.current) onCompleteRef.current();
  }, []);

  const scratchAt = useCallback((clientX, clientY) => {
    const canvas = canvasRef.current;
    const context = contextRef.current;
    if (!canvas || !context || completedRef.current) return;

    const rect = canvas.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) return;

    const point = {
      x: ((clientX - rect.left) / rect.width) * MASK_WIDTH,
      y: ((clientY - rect.top) / rect.height) * MASK_HEIGHT,
    };
    const previous = lastPointRef.current || point;

    context.beginPath();
    context.moveTo(previous.x, previous.y);
    context.lineTo(point.x, point.y);
    context.stroke();
    lastPointRef.current = point;

    strokesRef.current += 1;
    if (strokesRef.current % SAMPLE_EVERY_N_STROKES !== 0) return;

    const cleared = measureCleared();
    setProgress(cleared);
    if (cleared >= threshold) finish();
  }, [finish, measureCleared, threshold]);

  const handlePointerDown = useCallback((event) => {
    if (completedRef.current) return;
    event.preventDefault();
    // One code path for touch, mouse and pen; capture keeps the stroke alive outside the canvas.
    event.currentTarget.setPointerCapture?.(event.pointerId);
    drawingRef.current = true;
    lastPointRef.current = null;
    scratchAt(event.clientX, event.clientY);
  }, [scratchAt]);

  const handlePointerMove = useCallback((event) => {
    if (!drawingRef.current) return;
    event.preventDefault();
    scratchAt(event.clientX, event.clientY);
  }, [scratchAt]);

  const stopDrawing = useCallback((event) => {
    if (!drawingRef.current) return;
    drawingRef.current = false;
    lastPointRef.current = null;
    event.currentTarget.releasePointerCapture?.(event.pointerId);
  }, []);

  /** Keyboard and reduced-motion alternative required by the product spec. */
  const revealAll = useCallback(() => {
    const context = contextRef.current;
    if (context) {
      context.clearRect(0, 0, MASK_WIDTH, MASK_HEIGHT);
    }
    finish();
  }, [finish]);

  return {
    canvasRef,
    revealed,
    progress,
    reducedMotion: typeof window !== 'undefined' ? prefersReducedMotion() : false,
    handlers: {
      onPointerDown: handlePointerDown,
      onPointerMove: handlePointerMove,
      onPointerUp: stopDrawing,
      onPointerCancel: stopDrawing,
      onPointerLeave: stopDrawing,
    },
    revealAll,
  };
}

export { MASK_HEIGHT, MASK_WIDTH };
