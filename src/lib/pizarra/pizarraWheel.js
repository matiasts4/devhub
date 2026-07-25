/**
 * Wheel event routing — terminal/browser scroll must not trigger canvas zoom.
 */

export const PIZARRA_INTERACTIVE_WHEEL_SELECTOR = [
  '[data-testid="canvas-terminal"]',
  '[data-testid="canvas-terminal-container"]',
  '[data-testid="canvas-terminal-header"]',
  '[data-testid="terminal-viewport-shell"]',
  '[data-testid="terminal-content-body"]',
  '[data-testid="terminal-root-body"]',
  '[data-testid^="pizarra-browser-surface"]',
  '.xterm',
  '.xterm-viewport',
].join(', ');

export function isPizarraInteractiveWheelTarget(target) {
  if (!target || typeof target.closest !== 'function') return false;
  return Boolean(target.closest(PIZARRA_INTERACTIVE_WHEEL_SELECTOR));
}

const LIVE_SURFACE_BOUNDS_SELECTOR = [
  '[data-testid="canvas-terminal"]',
  '[data-testid="canvas-terminal-container"]',
  '[data-testid^="pizarra-browser-surface"]',
].join(', ');

function isPointInsideLiveSurfaceBounds(clientX, clientY) {
  if (typeof document === 'undefined' || clientX == null || clientY == null) return false;
  const containers = document.querySelectorAll(LIVE_SURFACE_BOUNDS_SELECTOR);
  for (const el of containers) {
    const rect = el.getBoundingClientRect();
    if (
      clientX >= rect.left &&
      clientX <= rect.right &&
      clientY >= rect.top &&
      clientY <= rect.bottom
    ) {
      return true;
    }
  }
  return false;
}

/** True when the canvas should handle wheel as zoom (not terminal scroll). */
export function shouldCanvasConsumeWheel(event) {
  if (!event) return false;
  if (isPizarraInteractiveWheelTarget(event.target)) return false;
  // Native VTE/browser overlays sit above the DOM — hit-test by screen coords.
  if (isPointInsideLiveSurfaceBounds(event.clientX, event.clientY)) return false;
  return true;
}
