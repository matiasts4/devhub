/**
 * extractBottomViewport — slice detection input to approximate herdr bottom viewport.
 *
 * @param {string} buffer — accumulated terminal text
 * @param {{ maxLines?: number }} [options]
 * @returns {string}
 */
export function processCarriageReturns(text) {
  if (!text || typeof text !== 'string' || !text.includes('\r')) return text;
  const normalized = text.replace(/\r\n/g, '\n');
  return normalized
    .split('\n')
    .map((line) => {
      if (!line.includes('\r')) return line;
      const parts = line.split('\r');
      return parts[parts.length - 1];
    })
    .join('\n');
}

export function extractBottomViewport(buffer, options = {}) {
  const maxLines = Math.max(1, Number(options.maxLines) || DEFAULT_DETECTION_VIEWPORT_LINES);
  if (!buffer || typeof buffer !== 'string') return '';
  const sanitized = processCarriageReturns(buffer);
  const lines = sanitized.split('\n');
  if (lines.length <= maxLines) return sanitized;
  return lines.slice(-maxLines).join('\n');
}

export const DEFAULT_DETECTION_VIEWPORT_LINES = 40;
export const DEFAULT_DETECTION_BUFFER_CHARS = 8192;

// Hard caps for termsize-derived sizing (W5). A viewport never needs more than
// a few hundred lines; the buffer cap bounds worst-case memory per session.
export const MAX_DETECTION_VIEWPORT_LINES = 240;
export const MAX_DETECTION_BUFFER_CHARS = 262144; // 256 KB

/**
 * resolveDetectionSizing — termsize-aware viewport/buffer sizing (W5).
 *
 * Viewport: max(default 40, terminal rows). On tall terminals the agent footer
 * can sit well below bottom-40 (diffs push lines), so the viewport scales with
 * rows. On small terminals the 40-line default already covers the full screen.
 *
 * Buffer: max(default 8 KB, rows*cols*2). A full alt-screen redraw is roughly
 * rows*cols visible chars; factor 2 covers soft-wrapped lines and residual
 * overhead. A too-small buffer stores a partial frame and bottom_lines(N) gets
 * measured from a mid-frame slice.
 *
 * Soft-wrap note: terminal-soft-wrapped logical lines arrive as one physical
 * line (no \n) in the PTY stream, so they count as one viewport line — that is
 * intentional and matches how the TUI anchors its footer.
 *
 * @param {{ cols?: number, rows?: number, viewportLines?: number, bufferChars?: number }} [options]
 *   viewportLines/bufferChars are explicit session-level overrides and win over
 *   the termsize-derived values.
 * @returns {{ viewportLines: number, bufferChars: number }}
 */
export function resolveDetectionSizing(options = {}) {
  const rows = Math.max(0, Math.floor(Number(options.rows) || 0));
  const cols = Math.max(0, Math.floor(Number(options.cols) || 0));

  let viewportLines = Math.floor(Number(options.viewportLines) || 0);
  if (!(viewportLines > 0)) {
    viewportLines = Math.max(DEFAULT_DETECTION_VIEWPORT_LINES, rows);
  }
  viewportLines = Math.min(Math.max(1, viewportLines), MAX_DETECTION_VIEWPORT_LINES);

  let bufferChars = Math.floor(Number(options.bufferChars) || 0);
  if (!(bufferChars > 0)) {
    bufferChars = Math.max(DEFAULT_DETECTION_BUFFER_CHARS, rows * cols * 2);
  }
  bufferChars = Math.min(
    Math.max(DEFAULT_DETECTION_BUFFER_CHARS, bufferChars),
    MAX_DETECTION_BUFFER_CHARS
  );

  return { viewportLines, bufferChars };
}
