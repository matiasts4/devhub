/**
 * Terminal layout sync — survivor recovery and layout-settled dispatch helpers.
 */

/**
 * Monotonic generation counter for every `devhub:terminal-layout-settled`
 * dispatch. Lets hidden panels detect that layout churn happened somewhere
 * (including another workspace) while they were opacity-hidden, even when the
 * event itself is filtered to the active workspace's panelIds.
 */
let terminalLayoutSettledGeneration = 0;

export function getTerminalLayoutSettledGeneration() {
  return terminalLayoutSettledGeneration;
}

export function dispatchTerminalLayoutSettled(detail = {}) {
  if (typeof window === 'undefined') return;
  terminalLayoutSettledGeneration += 1;
  window.dispatchEvent(
    new CustomEvent('devhub:terminal-layout-settled', {
      detail: { ...detail, at: Date.now(), generation: terminalLayoutSettledGeneration },
    })
  );
}

/**
 * Single-shot reveal event for a panel that just became visible inside a stacked
 * window. Mirrors the layout-show useLayoutEffect path used by workspace tab
 * switches, so window switches get the same soft-reveal/fit/recovery pipeline
 * instead of relying only on the survivor-recover burst.
 */
export function dispatchTerminalWindowVisible(detail = {}) {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(
    new CustomEvent('devhub:terminal-window-visible', {
      detail: { ...detail, at: Date.now() },
    })
  );
}
