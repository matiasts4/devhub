// summarizeTerminal — ZED assistant tool that captures the tail of a
// terminal session, strips ANSI locally, and returns a short structured
// digest with a status hint. 2s in-memory cache keyed by terminalId.
// Spec: ZTT-005. Cache is module-local and invisible to the model.

import { stripAnsi } from '../zedAnsiStrip';
import { resolveTerminalByName } from '../zedTerminalResolver';
import {
  mergeWorkspaceTerminalProcesses,
  workspaceTerminalsFromContext,
} from '../workspaceTerminalRegistry';
import { formatZedToolError } from '../zedChat/errors';

const CACHE_TTL_MS = 2000;
const OUTPUT_CAP_BYTES = 8 * 1024;
const SUMMARIZE_TOOL_NAME = 'summarize_terminal';

// OpenCode-style footer keywords we recognize in the cleaned tail.
// Order matters only for the order we record them in `waitingFor` — not for
// which one we match (we match ALL that appear).
const OPENCODE_FOOTER_KEYWORDS = ['Choose:', 'Choose', 'y/n', 'confirm', 'waiting'];

// Module-local cache. Per-process; cleared on session restart; never
// surfaced to the model.
const _cache = new Map(); // terminalId -> { ts: number, digest: object }

function getBaseUrl() {
  return process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3100';
}

function nowMs() {
  return Date.now();
}

function cacheGet(terminalId) {
  const hit = _cache.get(terminalId);
  if (!hit) return null;
  if (nowMs() - hit.ts > CACHE_TTL_MS) {
    _cache.delete(terminalId);
    return null;
  }
  return hit.digest;
}

function cacheSet(terminalId, digest) {
  _cache.set(terminalId, { ts: nowMs(), digest });
  // Best-effort: bound the cache at 256 entries so a long-running
  // session cannot grow it unbounded.
  if (_cache.size > 256) {
    const firstKey = _cache.keys().next().value;
    if (firstKey) _cache.delete(firstKey);
  }
}

function _resetSummarizeCacheForTests() {
  _cache.clear();
}

/**
 * Detect an OpenCode-style footer in the cleaned tail.
 * Returns a non-empty array of keyword hits when recognized; null otherwise.
 *
 * @param {string} cleanTail
 * @returns {string[] | null}
 */
function detectOpencodeFooter(cleanTail) {
  if (typeof cleanTail !== 'string' || !cleanTail) return null;
  const tail = cleanTail.toLowerCase();
  const hits = [];
  for (const kw of OPENCODE_FOOTER_KEYWORDS) {
    if (tail.includes(kw.toLowerCase())) {
      hits.push(kw);
    }
  }
  return hits.length > 0 ? hits : null;
}

/**
 * Derive a stable "waitingFor" hint from a cleaned tail. We grab the
 * last non-blank line so the model can show a short user-facing
 * prompt, but we cap to 200 chars to keep the digest small.
 *
 * @param {string} cleanTail
 * @returns {string}
 */
function deriveWaitingFor(cleanTail) {
  const lines = String(cleanTail || '')
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean);
  const last = lines[lines.length - 1] || '';
  if (last.length <= 200) return last;
  return last.slice(0, 200) + '…';
}

/**
 * Build the digest object (no fetch, no cache). Pure function over the
 * cleaned text. status is one of:
 *   - 'waiting_user_input' (OpenCode footer detected)
 *   - 'unknown' (no recognized footer / blank / non-OpenCode)
 *   - 'idle' / 'running' are reserved for future heuristic expansion
 *     (kept as known values so the model can switch on them).
 *
 * @param {{ terminalId: string, displayName: string, program?: string,
 *           cleanTail: string, capturedAt: number }} args
 * @returns {object}
 */
function _buildDigest({ terminalId, displayName, program, cleanTail, capturedAt }) {
  const footerHits = detectOpencodeFooter(cleanTail);
  if (footerHits && footerHits.length > 0) {
    return {
      terminalId,
      displayName,
      ...(program ? { program } : {}),
      status: 'waiting_user_input',
      waitingFor: deriveWaitingFor(cleanTail),
      suggestedActions: footerHits,
      tuiReady: true,
      capturedAt,
    };
  }
  return {
    terminalId,
    displayName,
    ...(program ? { program } : {}),
    status: 'unknown',
    capturedAt,
  };
}

/**
 * Look up a terminal by displayName via the live `/api/terminal/processes`
 * endpoint. Returns the terminalId + displayName pair, or a not_found
 * payload (no HTTP call to capture).
 *
 * @param {string} baseUrl
 * @param {string} name
 * @returns {Promise<{ ok: true, terminalId: string, displayName: string }
 *                | { ok: false, code: 'not_found' | 'ambiguous',
 *                    candidates?: Array<{terminalId: string, displayName: string}> }>}
 */
async function resolveByName(baseUrl, name, context = {}) {
  const clientTerminals = workspaceTerminalsFromContext(context);
  try {
    const res = await fetch(`${baseUrl}/api/terminal/processes`, { cache: 'no-store' });
    const data = res.ok ? await res.json().catch(() => ({})) : {};
    const list = mergeWorkspaceTerminalProcesses(clientTerminals, data?.processes || []);
    return resolveTerminalByName(name, list);
  } catch {
    const list = mergeWorkspaceTerminalProcesses(clientTerminals, []);
    return resolveTerminalByName(name, list);
  }
}

/**
 * Capture the most recent output for a terminal session.
 * Returns the cleaned text (ANSI stripped, capped) or null when the
 * session is gone (404).
 *
 * @param {string} baseUrl
 * @param {string} terminalId
 * @returns {Promise<{ ok: true, cleanTail: string, displayName: string | null }
 *                | { ok: false, code: 'not_found' }>}
 */
async function captureTail(baseUrl, terminalId) {
  const url = `${baseUrl}/api/terminal/session/${encodeURIComponent(terminalId)}/capture`;
  const res = await fetch(url, { cache: 'no-store' });
  if (!res.ok) {
    if (res.status === 404) return { ok: false, code: 'not_found' };
    return { ok: false, code: 'not_found' };
  }
  const data = await res.json().catch(() => ({}));
  const raw = typeof data?.output === 'string' ? data.output : '';
  const clean = stripAnsi(raw);
  // 8KB cap: drop the head, keep the tail, normalize line endings.
  const capped = clean.length > OUTPUT_CAP_BYTES
    ? clean.slice(clean.length - OUTPUT_CAP_BYTES)
    : clean;
  // The /capture route doesn't return displayName; we may have it from
  // the resolver pass, so the caller can pass it in.
  return { ok: true, cleanTail: capped, displayName: data?.displayName || null };
}

export const summarizeTerminalTool = {
  name: SUMMARIZE_TOOL_NAME,
  description:
    'Resume en español (2 frases) lo que está pasando en una terminal: si el agente está esperando tu input, qué opciones ofrece, o un estado neutro. Usa la cola de cache de 2s para no capturar la misma terminal dos veces en una misma ráfaga. Acepta name (recomendado) o terminalId.',
  parameters: {
    name: {
      type: 'string',
      description: 'Display name de la terminal (recomendado; ej. "Chase").',
    },
    terminalId: {
      type: 'string',
      description: 'terminalId crudo (p2, term-xxx, etc.). Úsalo solo si no tenés el name.',
    },
    program: {
      type: 'string',
      description:
        "Opcional: hint sobre qué agente corre adentro ('opencode', 'codex', 'hermes', 'bash'). Mejora la heurística de status.",
    },
  },
  async execute(params, context = {}) {
    const { name, terminalId: rawId, program } = params || {};
    const baseUrl = getBaseUrl();
    const capturedAt = nowMs();

    let terminalId = null;
    let displayName = null;

    if (typeof name === 'string' && name.trim()) {
      const lookup = await resolveByName(baseUrl, name.trim(), context);
      if (!lookup.ok) {
        return { error: lookup.code, ...formatZedToolError(SUMMARIZE_TOOL_NAME, lookup) };
      }
      terminalId = lookup.terminalId;
      displayName = lookup.displayName;
    } else if (typeof rawId === 'string' && rawId.trim()) {
      terminalId = rawId.trim();
    } else {
      return { error: 'missing required parameter: name or terminalId' };
    }

    // Cache hit?
    const cached = cacheGet(terminalId);
    if (cached) return cached;

    // Capture + build digest.
    const capture = await captureTail(baseUrl, terminalId);
    if (!capture.ok) {
      return {
        error: capture.code,
        ...formatZedToolError(SUMMARIZE_TOOL_NAME, { code: capture.code }),
      };
    }

    // The capture endpoint can return displayName in some paths; prefer
    // the one we got from the resolver when present.
    if (!displayName && capture.displayName) displayName = capture.displayName;

    const digest = _buildDigest({
      terminalId,
      displayName: displayName || '',
      program: typeof program === 'string' ? program : undefined,
      cleanTail: capture.cleanTail,
      capturedAt,
    });
    cacheSet(terminalId, digest);
    return digest;
  },
};

// Exposed for test isolation only.
export { _resetSummarizeCacheForTests };
