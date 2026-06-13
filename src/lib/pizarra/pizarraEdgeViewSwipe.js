/**
 * Edge drag zones for switching pizarra workspace windows (V1 ↔ V2…).
 * Pure helpers — no DOM.
 */

export const EDGE_ZONE_WIDTH_PX = 56;
export const SWIPE_COMMIT_RATIO = 0.28;
export const SWIPE_MIN_COMMIT_PX = 96;
export const SWIPE_VELOCITY_COMMIT_PX = 520;
export const RUBBER_BAND_FACTOR = 0.22;

/**
 * @typedef {'left' | 'right'} EdgeSide
 * @typedef {'prev' | 'next' | 'cancel'} EdgeSwipeOutcome
 */

/**
 * Pan offset while dragging from an edge zone.
 * Right zone + drag left → negative deltaX → camera moves toward next view.
 */
export function computeEdgeDragPan(
  startPan,
  deltaX,
  { rubberBand = true, atBoundary = false } = {}
) {
  const baseX = startPan?.x ?? 0;
  const baseY = startPan?.y ?? 0;
  let dx = deltaX;

  if (rubberBand && atBoundary) {
    const sign = dx === 0 ? 0 : dx > 0 ? 1 : -1;
    const abs = Math.abs(dx);
    dx = sign * abs * RUBBER_BAND_FACTOR;
  }

  return { x: baseX + dx, y: baseY };
}

/**
 * Decide whether a drag release commits to prev/next view or snaps back.
 */
export function resolveEdgeSwipeCommit({
  side,
  deltaX,
  viewportWidth = 1200,
  velocityX = 0,
  canGoPrev = false,
  canGoNext = false,
} = {}) {
  const threshold = Math.max(SWIPE_MIN_COMMIT_PX, viewportWidth * SWIPE_COMMIT_RATIO);
  const fastSwipe = Math.abs(velocityX) >= SWIPE_VELOCITY_COMMIT_PX;

  if (side === 'right') {
    const towardNext = deltaX < 0 || velocityX < 0;
    if (towardNext && (Math.abs(deltaX) >= threshold || fastSwipe) && canGoNext) {
      return 'next';
    }
    return 'cancel';
  }

  if (side === 'left') {
    const towardPrev = deltaX > 0 || velocityX > 0;
    if (towardPrev && (Math.abs(deltaX) >= threshold || fastSwipe) && canGoPrev) {
      return 'prev';
    }
    return 'cancel';
  }

  return 'cancel';
}

/** 0..1 progress for edge shimmer during drag. */
export function edgeSwipeProgress(deltaX, viewportWidth = 1200, side = 'right') {
  const threshold = Math.max(SWIPE_MIN_COMMIT_PX, viewportWidth * SWIPE_COMMIT_RATIO);
  const raw = side === 'right' ? -deltaX : deltaX;
  return Math.min(1, Math.max(0, raw / threshold));
}

/**
 * Quantized pan between two view camera positions (discrete V1↔V2 slide).
 */
export function computeQuantizedEdgePan(fromPan, toPan, progress = 0, { rubberBand = false } = {}) {
  const t = rubberBand
    ? Math.max(-0.12, Math.min(0.12, progress)) * RUBBER_BAND_FACTOR
    : Math.max(0, Math.min(1, progress));
  return {
    x: (fromPan?.x ?? 0) + ((toPan?.x ?? 0) - (fromPan?.x ?? 0)) * t,
    y: (fromPan?.y ?? 0) + ((toPan?.y ?? 0) - (fromPan?.y ?? 0)) * t,
  };
}

/** Map horizontal drag distance to quantized progress toward adjacent view. */
export function edgeDragToProgress(deltaX, viewportWidth = 1200, side = 'right') {
  const threshold = Math.max(SWIPE_MIN_COMMIT_PX, viewportWidth * SWIPE_COMMIT_RATIO);
  const raw = side === 'right' ? -deltaX : deltaX;
  return raw / threshold;
}
