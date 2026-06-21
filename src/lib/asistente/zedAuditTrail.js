/**
 * Client-side audit trail: what the user said vs what Zed did.
 * Persisted in sessionStorage for the current browser session.
 */

export const ZED_AUDIT_STORAGE_KEY = 'devhub:zed-audit-trail';
const MAX_ENTRIES = 80;

/**
 * @typedef {{
 *   ts: string,
 *   userMessage?: string,
 *   assistantText?: string,
 *   tools?: Array<{ tool: string, input?: object, result?: unknown, ok?: boolean }>,
 *   note?: string,
 * }} ZedAuditEntry
 */

/**
 * @returns {ZedAuditEntry[]}
 */
export function readZedAuditTrail() {
  if (typeof window === 'undefined') return [];
  try {
    const raw = window.sessionStorage.getItem(ZED_AUDIT_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

/**
 * @param {ZedAuditEntry} entry
 */
export function appendZedAuditEntry(entry) {
  if (typeof window === 'undefined') return;
  try {
    const prev = readZedAuditTrail();
    const next = [...prev, { ts: new Date().toISOString(), ...entry }].slice(-MAX_ENTRIES);
    window.sessionStorage.setItem(ZED_AUDIT_STORAGE_KEY, JSON.stringify(next));
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('devhub:zed-audit-updated', { detail: { count: next.length } }));
    }
  } catch {
    // ignore quota errors
  }
}

/**
 * @param {string} userMessage
 * @param {Array<{ tool: string, input?: object, result?: unknown }>|null|undefined} toolResults
 * @param {string} [assistantText]
 */
/**
 * Export the audit trail as a JSON blob (append-only, immutable from UI).
 *
 * @returns {{ json: string, count: number }}
 */
export function exportZedAuditTrail() {
  const entries = readZedAuditTrail();
  return {
    json: JSON.stringify(entries, null, 2),
    count: entries.length,
  };
}

export function recordZedInteraction(userMessage, toolResults, assistantText = '') {
  const tools = Array.isArray(toolResults)
    ? toolResults.map((t) => {
        let parsed = t.result;
        if (typeof parsed === 'string') {
          try {
            parsed = JSON.parse(parsed);
          } catch {
            parsed = t.result;
          }
        }
        return {
          tool: t.tool,
          input: t.input,
          result: parsed,
          ok: !(parsed && typeof parsed === 'object' && parsed.error),
          fast_path: Boolean(t.fast_path),
        };
      })
    : [];

  appendZedAuditEntry({
    userMessage: typeof userMessage === 'string' ? userMessage : '',
    assistantText: typeof assistantText === 'string' ? assistantText : '',
    tools,
    note: tools.some((t) => t.fast_path) ? 'fast_path' : undefined,
  });
}

export default { readZedAuditTrail, appendZedAuditEntry, recordZedInteraction };
