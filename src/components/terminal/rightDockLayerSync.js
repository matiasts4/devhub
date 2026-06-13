/**
 * Live right-dock layer sync helpers.
 *
 * During resize drag the panel library mutates placeholder geometry on the
 * compositor thread, but pushing every tick through React state + Framer Motion
 * adds a frame or more of latency. These helpers read the placeholder rect and
 * write left/width directly on the absolutely positioned dock layer.
 */

export function applyRightDockLayerBounds(element, bounds) {
  if (!element || !bounds) return false;

  const left = Math.round(bounds.left);
  const width = Math.round(bounds.width);
  if (!Number.isFinite(left) || !Number.isFinite(width) || width <= 0) {
    return false;
  }

  const nextLeft = `${left}px`;
  const nextWidth = `${width}px`;
  if (element.style.left === nextLeft && element.style.width === nextWidth) {
    return false;
  }

  element.style.left = nextLeft;
  element.style.width = nextWidth;
  return true;
}

export function shouldDeferRightDockSizePersist(isDragging) {
  return isDragging === true;
}