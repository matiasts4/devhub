/**
 * Opt-in TUI pointer/wheel probe.
 * Enable: localStorage.setItem('devhubTuiPointerDebug', '1')
 * Logs go to POST /api/terminal/log (same channel as viewport diagnostics).
 */

export function isTuiPointerDebugEnabled() {
  try {
    const storage = globalThis.localStorage;
    if (!storage) return false;
    return storage.getItem('devhubTuiPointerDebug') === '1';
  } catch {
    return false;
  }
}

function readMouseTrackingMode(term) {
  try {
    const mode = term?._core?.coreService?.decPrivateModes?.mouseTrackingMode;
    return typeof mode === 'number' ? mode : null;
  } catch {
    return null;
  }
}

function readDomFocus(term) {
  try {
    const doc = globalThis.document;
    if (!doc) return null;
    const active = doc.activeElement;
    if (!active || !term) return false;
    if (term.textarea && (active === term.textarea || term.textarea.contains?.(active))) {
      return true;
    }
    const el = term.element;
    return Boolean(el && (active === el || el.contains?.(active)));
  } catch {
    return null;
  }
}

/**
 * @param {'tui-pointer'|'tui-wheel'} tag
 * @param {object} payload
 */
export function logTuiPointerDebug(tag, payload = {}) {
  if (!isTuiPointerDebugEnabled()) return;
  const term = payload.term;
  const extra = {
    path: payload.path || 'unknown',
    panelId: payload.panelId ?? null,
    zone: payload.zone ?? null,
    cell: payload.cell ?? null,
    mouseTrackingMode:
      payload.mouseTrackingMode !== undefined
        ? payload.mouseTrackingMode
        : readMouseTrackingMode(term),
    domFocus: payload.domFocus !== undefined ? payload.domFocus : readDomFocus(term),
    tuiSessionActive: payload.tuiSessionActive ?? null,
    grokTuiReady: payload.grokTuiReady ?? null,
    opencodeFooterConfirmed: payload.opencodeFooterConfirmed ?? null,
    isActivePanel: payload.isActivePanel ?? null,
    tuiReady: payload.tuiReady ?? null,
    eligible: payload.eligible ?? null,
    ...payload.extra,
  };
  delete extra.term;
  try {
    fetch('/api/terminal/log', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        tag,
        msg: String(payload.path || tag),
        extra,
      }),
    }).catch(() => {});
  } catch {
    // never crash
  }
}

export { readMouseTrackingMode, readDomFocus };
