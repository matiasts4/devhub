/**
 * Client-side events for Zed tools that mutate workspace UI surfaces
 * (close terminal panel, close in-app browser).
 */

export function dispatchZedCloseTerminal(detail = {}) {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent('devhub:zed-close-terminal', { detail }));
}

export function dispatchZedCloseUrl(detail = {}) {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent('devhub:zed-close-url', { detail }));
}

export function dispatchZedCloseFromToolResults(toolResults) {
  if (!Array.isArray(toolResults)) return;
  for (const entry of toolResults) {
    if (!entry || typeof entry !== 'object') continue;
    const raw = entry.result;
    let parsed = raw;
    if (typeof raw === 'string') {
      try {
        parsed = JSON.parse(raw);
      } catch {
        parsed = null;
      }
    }
    if (!parsed || parsed.error) continue;

    if (entry.tool === 'close_terminal' && parsed.success === true) {
      dispatchZedCloseTerminal({
        session_id: parsed.sessionId || parsed.session_id || null,
        name: parsed.displayName || null,
      });
    }

    if (entry.tool === 'close_url' && parsed.closed === true) {
      dispatchZedCloseUrl({ workspace: true });
    }
  }
}
