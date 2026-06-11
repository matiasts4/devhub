/**
 * Spanish error formatter for ZED assistant tool failures.
 *
 * Implements ZCX-001. The formatter is the single point that translates
 * raw tool errors (resolver results, policy decisions, network failures)
 * into friendly, plain Spanish messages that the chat surfaces to the
 * user. It also guarantees:
 *
 *   - No "Error:" prefix.
 *   - No stack traces in user-facing messages.
 *   - Stable, canonical Spanish strings (see SPANISH below).
 *
 * Pure: no React, no IO, no globals. Consumed by `useZedChat` (Phase 3).
 *
 * Result shape:
 *   { message: string; kind: ErrorKind; details?: object }
 */

// Tool names that the formatter recognizes. Anything else falls through
// to the generic branch.
const KNOWN_TOOLS = new Set([
  'open_terminal',
  'execute_in_terminal',
  'list_terminals',
  'summarize_terminal',
  'close_terminal',
  'review_terminal_output',
]);

// Canonical Spanish strings — these are part of the public UX contract
// (ZCX-001). Do not rewrite without spec approval. The WELCOME_LINE is
// reused by `useZedChat` (ZCX-002 welcome scenario).
const SPANISH = Object.freeze({
  notFound: 'no encontré ninguna terminal con ese nombre. Activas: {list}.',
  notFoundEmpty: 'no encontré ninguna terminal con ese nombre.',
  ambiguous: 'hay varias terminales con nombres parecidos: {candidates}. ¿a cuál te referís?',
  tooLong: 'el script es demasiado largo (máximo 64 líneas × 256 caracteres).',
  multilineBlocked: 'el comando no se puede ejecutar: tiene {N} líneas, excede el máximo (64).',
  bothNameAndSession: 'no podés pasar name y session_id a la vez.',
  generic: '{message}',
  unknown: 'error desconocido',
});

const WELCOME_LINE =
  'sos Zed, tu copiloto de terminales. para tareas del swarm o lanzar agentes, usá el Pod.';

const MAX_VISIBLE_NAMES = 5;

/**
 * @param {string[] | undefined | null} names
 * @returns {string}
 */
function formatActiveNames(names) {
  if (!Array.isArray(names) || names.length === 0) {
    return SPANISH.notFoundEmpty;
  }
  if (names.length <= MAX_VISIBLE_NAMES) {
    return names.join(', ');
  }
  const head = names.slice(0, MAX_VISIBLE_NAMES).join(', ');
  const remaining = names.length - MAX_VISIBLE_NAMES;
  return `${head} (y ${remaining} más)`;
}

/**
 * @param {Array<{terminalId: string, displayName: string}>} candidates
 * @returns {string}
 */
function formatCandidates(candidates) {
  if (!Array.isArray(candidates) || candidates.length === 0) return '';
  return candidates.map((c) => `${c.displayName} (${c.terminalId})`).join(', ');
}

/**
 * Lowercase the first character of a string without touching the rest.
 *
 * @param {string} text
 * @returns {string}
 */
function lowercaseFirst(text) {
  if (!text) return text;
  return text.charAt(0).toLowerCase() + text.slice(1);
}

/**
 * Strip leading "Error:" and any stack-frame fragments from a string so
 * the chat never surfaces raw debugging noise to the user.
 *
 * @param {string} text
 * @returns {string}
 */
function cleanUserMessage(text) {
  if (typeof text !== 'string' || !text) return SPANISH.unknown;
  let out = text.replace(/^Error:\s*/i, '');
  // Drop frames like "at file.js:42" or "at async function (file.js:42:7)".
  out = out
    .split('\n')
    .filter((line) => !/\s+at\s+.+:\d+/.test(line))
    .join('\n')
    .trim();
  return out || SPANISH.unknown;
}

/**
 * @typedef {'not_found' | 'ambiguous' | 'too_long' | 'multiline_blocked'
 *           | 'both_name_and_session' | 'policy_blocked' | 'unsafe_url'
 *           | 'generic'} ErrorKind
 */

/**
 * Format a tool error into a user-facing Spanish message.
 *
 * @param {string} toolName
 * @param {unknown} error
 * @returns {{ message: string, kind: ErrorKind, details?: object }}
 */
function formatZedToolError(toolName, error) {
  const safeTool = typeof toolName === 'string' ? toolName : '';
  const recognized = KNOWN_TOOLS.has(safeTool);

  // Pull a code out of the error or its .cause — the resolver and the
  // tools are the ones that set this.
  const code = (() => {
    if (error && typeof error === 'object' && 'code' in error) {
      return String(/** @type {{code: unknown}} */ (error).code);
    }
    if (error && typeof error === 'object' && error.cause && typeof error.cause === 'object') {
      return 'code' in error.cause ? String(/** @type {any} */ (error.cause).code) : null;
    }
    return null;
  })();

  // Build a stable, normalized details bag for the caller / telemetry.
  const details = error && typeof error === 'object' ? { ...error } : undefined;

  // Unknown tool name: fall through to generic, regardless of code.
  // We still use the raw error message so the user sees *something* useful.
  if (!recognized) {
    if (error instanceof Error) {
      return {
        kind: 'generic',
        message: lowercaseFirst(cleanUserMessage(error.message)),
      };
    }
    if (error && typeof error === 'object') {
      const raw = error.message || error.error || error.reason || '';
      if (raw) {
        return {
          kind: 'generic',
          message: lowercaseFirst(cleanUserMessage(String(raw))),
        };
      }
    }
    return { kind: 'generic', message: SPANISH.unknown };
  }

  switch (code) {
    case 'not_found': {
      const list = formatActiveNames(error?.activeNames ?? error?.cause?.activeNames);
      return {
        kind: 'not_found',
        message:
          list === SPANISH.notFoundEmpty
            ? SPANISH.notFoundEmpty
            : SPANISH.notFound.replace('{list}', list),
        details,
      };
    }
    case 'ambiguous': {
      const candidates = formatCandidates(error?.candidates ?? error?.cause?.candidates);
      return {
        kind: 'ambiguous',
        message: SPANISH.ambiguous.replace('{candidates}', candidates || ''),
        details,
      };
    }
    case 'too_long': {
      return { kind: 'too_long', message: SPANISH.tooLong, details };
    }
    case 'multiline_blocked': {
      const n = Number(error?.lineCount ?? error?.cause?.lineCount) || 0;
      return {
        kind: 'multiline_blocked',
        message: SPANISH.multilineBlocked.replace('{N}', String(n)),
        details,
      };
    }
    case 'both_name_and_session': {
      return { kind: 'both_name_and_session', message: SPANISH.bothNameAndSession, details };
    }
    case 'policy_blocked':
    case 'unsafe_url': {
      // Map to generic for now; the canonical Spanish phrasing for these
      // is owned by Phase 3 (T-301) when `useZedChat` wires it in.
      const raw =
        error && typeof error === 'object'
          ? error.reason || error.message || error.error || ''
          : '';
      return {
        kind: /** @type {ErrorKind} */ (code),
        message: lowercaseFirst(cleanUserMessage(String(raw))) || SPANISH.unknown,
        details,
      };
    }
    default: {
      if (!recognized) {
        // Unknown tool name: still pass through the error message but
        // marked generic, so the caller can apply its own policy.
      }
      if (error instanceof Error) {
        return {
          kind: 'generic',
          message: lowercaseFirst(cleanUserMessage(error.message)),
        };
      }
      if (typeof error === 'string' && error) {
        return { kind: 'generic', message: lowercaseFirst(cleanUserMessage(error)) };
      }
      if (error && typeof error === 'object') {
        const raw = error.message || error.error || error.reason || '';
        if (raw) {
          return {
            kind: 'generic',
            message: lowercaseFirst(cleanUserMessage(String(raw))),
          };
        }
      }
      return { kind: 'generic', message: SPANISH.unknown };
    }
  }
}

/**
 * Alias for `formatZedToolError` — matches the long-form design name.
 *
 * @param {string} toolName
 * @param {unknown} error
 */
function formatToolErrorForUser(toolName, error) {
  return formatZedToolError(toolName, error);
}

// Exposed for test isolation and Phase 3 / Phase 4 reuse.
const _SPANISH = SPANISH;
const _WELCOME_LINE = WELCOME_LINE;
const _formatActiveNames = formatActiveNames;
const _formatCandidates = formatCandidates;
const _cleanUserMessage = cleanUserMessage;

export {
  formatZedToolError,
  formatToolErrorForUser,
  _SPANISH,
  _WELCOME_LINE,
  _formatActiveNames,
  _formatCandidates,
  _cleanUserMessage,
};
