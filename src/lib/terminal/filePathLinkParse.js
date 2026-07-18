/**
 * Detect file-path-like tokens in a single terminal buffer line (plain text).
 * Used by agent TUI link providers (Grok / OpenCode).
 */

const MAX_PATH_LEN = 512;

/**
 * Common source/config extensions agents mention.
 * Longer tokens first so `json` wins over `js`, `tsx` over `ts`, etc.
 */
const FILE_EXT =
  'graphql|gitignore|dockerignore|editorconfig|prettierrc|eslintrc|jsx|tsx|mjs|cjs|json|mdx|css|scss|html|htm|java|swift|svelte|astro|toml|ya?ml|xml|svg|txt|bash|zsh|ps1|sql|gql|proto|cpp|hpp|lock|env|js|ts|py|rs|go|kt|rb|php|vue|sh|cc|cs|fs|jl|lua|zig|nim|exs|ex|erl|clj|scala|dart|c|h|r';

const LINE_COL_SUFFIX = /:(\d{1,7})(?::(\d{1,7}))?$/;

// Built without String.raw so Windows backslashes are unambiguous.
const WIN_ABS = new RegExp(
  '([A-Za-z]:\\\\(?:[^\\s\\x00-\\x1f"\'<>|*?]{1,' + MAX_PATH_LEN + '}))',
  'g'
);
const WIN_ABS_FWD = new RegExp(
  '([A-Za-z]:/(?:[^\\s\\x00-\\x1f"\'<>|*?]{1,' + MAX_PATH_LEN + '}))',
  'g'
);
const POSIX_ABS = new RegExp(
  '((?:/[^\\s\\x00-\\x1f"\'<>|*?]+){1,' + Math.floor(MAX_PATH_LEN / 2) + '})',
  'g'
);
const RELATIVE = new RegExp(
  '((?:\\.{1,2}[/\\\\])?(?:[\\w.@%+=~-]+[/\\\\])+[\\w.@%+=~-]+(?:\\.[A-Za-z0-9]{1,20})?|(?:[\\w.@%+=~-]+\\.(?:' +
    FILE_EXT +
    ')))',
  'gi'
);

/**
 * @param {string} raw
 * @returns {{ path: string, line?: number, column?: number }}
 */
export function splitPathLineColumn(raw) {
  const text = String(raw || '');
  const m = text.match(LINE_COL_SUFFIX);
  if (!m) return { path: text };
  const path = text.slice(0, m.index);
  const line = Number(m[1]);
  const column = m[2] != null ? Number(m[2]) : undefined;
  return {
    path,
    line: Number.isFinite(line) ? line : undefined,
    column: Number.isFinite(column) ? column : undefined,
  };
}

/**
 * @param {string} path
 */
function looksLikeUrl(path) {
  return /^(?:https?|file|data|vscode):\/\//i.test(path) || /^www\./i.test(path);
}

/**
 * @param {string} path
 */
function isPlausiblePath(path) {
  if (!path || path.length < 2 || path.length > MAX_PATH_LEN) return false;
  if (looksLikeUrl(path)) return false;
  if (/^\d+(?:\.\d+)+$/.test(path)) return false;
  if (!/[/\\]/.test(path) && !/\.[A-Za-z0-9]{1,20}$/.test(path)) return false;
  return true;
}

/**
 * Trim trailing punctuation often left after paths in prose.
 * @param {string} raw
 */
function trimPathToken(raw) {
  return String(raw || '').replace(/[,;.)\]}'"`]+$/g, '');
}

/**
 * Find non-overlapping path matches left-to-right.
 * startCol/endCol are 0-based string indices; endCol is exclusive.
 *
 * @param {string} lineText
 * @returns {Array<{ raw: string, path: string, line?: number, column?: number, startCol: number, endCol: number }>}
 */
export function findFilePathMatches(lineText) {
  const line = String(lineText || '');
  if (!line) return [];

  /** @type {Array<{ raw: string, path: string, line?: number, column?: number, startCol: number, endCol: number, priority: number }>} */
  const candidates = [];

  const collect = (regex, priority) => {
    regex.lastIndex = 0;
    let m;
    while ((m = regex.exec(line)) !== null) {
      let fullRaw = trimPathToken(m[1] || m[0]);
      if (!fullRaw) continue;

      // Attach optional :line(:col) if immediately after the token on the line.
      let start = m.index;
      // Align start if trim shortened from the end only (start stays m.index for capture group 1).
      if (m[1] && m[0].indexOf(m[1]) > 0) {
        start = m.index + m[0].indexOf(m[1]);
      }
      let end = start + fullRaw.length;

      // If regex did not include :line, extend when present on the line.
      const after = line.slice(end);
      const locExt = after.match(/^:(\d{1,7})(?::(\d{1,7}))?/);
      if (locExt) {
        end += locExt[0].length;
        fullRaw = line.slice(start, end);
      }

      // Reject URL hosts that look like paths (e.g. //example.com/foo.js from https:)
      const prefix = line.slice(Math.max(0, start - 8), start);
      if (/https?:$/i.test(prefix) || /https?:\/$/i.test(prefix) || /https?:\/\/$/i.test(prefix)) {
        continue;
      }
      if (looksLikeUrl(fullRaw) || fullRaw.includes('://')) continue;

      const withLoc = splitPathLineColumn(fullRaw);
      if (!isPlausiblePath(withLoc.path)) continue;

      candidates.push({
        raw: fullRaw,
        path: withLoc.path,
        line: withLoc.line,
        column: withLoc.column,
        startCol: start,
        endCol: end,
        priority,
      });

      // Avoid zero-length loops
      if (regex.lastIndex === m.index) regex.lastIndex += 1;
    }
  };

  collect(WIN_ABS, 4);
  collect(WIN_ABS_FWD, 4);
  collect(POSIX_ABS, 3);
  collect(RELATIVE, 1);

  candidates.sort(
    (a, b) => a.startCol - b.startCol || b.priority - a.priority || b.endCol - a.endCol
  );

  /** @type {typeof candidates} */
  const selected = [];
  let cursor = 0;
  for (const c of candidates) {
    if (c.startCol < cursor) continue;
    selected.push(c);
    cursor = c.endCol;
  }

  return selected.map((c) => {
    const rest = { ...c };
    delete rest.priority;
    return rest;
  });
}
