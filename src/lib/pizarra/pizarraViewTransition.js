/**
 * Animated camera pan between pizarra workspace windows (V1 ↔ V2).
 */

export function easeOutCubic(t) {
  const x = Math.min(1, Math.max(0, t));
  return 1 - (1 - x) ** 3;
}

export function prefersReducedMotion() {
  if (typeof window === 'undefined') return false;
  return window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches === true;
}

/**
 * Interpolate pan from → to over `duration` ms.
 * Returns cancel function.
 */
export function animatePanTransition({
  fromPan,
  toPan,
  duration = 220,
  onFrame,
  onComplete,
} = {}) {
  if (typeof window === 'undefined' || duration <= 0) {
    onFrame?.(toPan);
    onComplete?.();
    return () => {};
  }

  const start = performance.now();
  let raf = null;

  const tick = (now) => {
    const t = easeOutCubic((now - start) / duration);
    onFrame?.({
      x: (fromPan?.x ?? 0) + ((toPan?.x ?? 0) - (fromPan?.x ?? 0)) * t,
      y: (fromPan?.y ?? 0) + ((toPan?.y ?? 0) - (fromPan?.y ?? 0)) * t,
    });
    if (now - start < duration) {
      raf = requestAnimationFrame(tick);
    } else {
      onFrame?.(toPan);
      onComplete?.();
    }
  };

  raf = requestAnimationFrame(tick);
  return () => {
    if (raf != null) cancelAnimationFrame(raf);
  };
}