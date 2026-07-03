/* eslint-disable no-control-regex -- OSC title sequences contain ESC/BEL bytes */
/**
 * oscTitleParser — extract OSC 0/2 title sequences from PTY output.
 *
 * xterm.js and most terminal emulators emit these sequences when the running
 * program sets the window/icon title. We capture them server-side from the raw
 * PTY stream so we do not have to forward title changes over the WebSocket,
 * which risks injecting control messages into the TUI prompt.
 */

const OSC_TITLE_RE = /\x1b\](0|2);([^\x07\x1b]*)(?:\x07|\x1b\\)/g;
const MAX_OSC_TITLE_BUFFER = 1024;

/**
 * Update session.title from OSC 0/2 sequences found in `chunk`.
 * Keeps a small trailing buffer so titles split across PTY chunks are not lost.
 *
 * @param {object} session — must have mutable `.title` and `._oscTitleBuffer`
 * @param {string} chunk — raw PTY output
 */
export function processOscTitle(session, chunk) {
  if (typeof chunk !== 'string' || !chunk) return;

  const buffer = (session._oscTitleBuffer || '') + chunk;
  OSC_TITLE_RE.lastIndex = 0;
  let match;
  let lastIndex = 0;

  while ((match = OSC_TITLE_RE.exec(buffer)) !== null) {
    session.title = match[2] || null;
    lastIndex = OSC_TITLE_RE.lastIndex;
  }

  const remaining = buffer.slice(lastIndex);
  session._oscTitleBuffer = remaining.slice(-MAX_OSC_TITLE_BUFFER);
}

/**
 * Strip OSC 0/2 title sequences from a terminal chunk before rendering or
 * storing it. This keeps the output clean because the client already gets the
 * title through its own xterm.js parsing.
 *
 * @param {string} chunk
 * @returns {string}
 */
export function stripOscTitleSequences(chunk) {
  if (typeof chunk !== 'string' || !chunk) return chunk;
  return chunk.replace(OSC_TITLE_RE, '');
}
/* eslint-enable no-control-regex */
