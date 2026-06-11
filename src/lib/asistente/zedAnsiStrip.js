/**
 * Local ANSI escape sequence stripper.
 *
 * No `strip-ansi` dep. Used by `summarize_terminal` (Phase 2) and exposed
 * for direct unit testing here.
 *
 * Handles:
 *   - CSI sequences:    \u001b[ ... letter    (colors, cursor, clear)
 *   - OSC sequences:    \u001b] ... \u0007     (hyperlinks, window title)
 *   - Single-char ESC:  \u001b <intermediate>  (charset switches, etc.)
 *   - CRLF → LF normalization
 *   - Trailing whitespace per line is trimmed.
 *
 * Input may be string, Buffer, null, or undefined. null/undefined → ''.
 * Strings with no escapes are returned unchanged (besides line trimming
 * and CRLF normalization).
 */

// CSI: ESC [ ... final-byte (0x40-0x7E, common range a-zA-Z)
const CSI_RE = /\u001b\[[0-9;?]*[a-zA-Z]/g;
// OSC: ESC ] ... BEL (or ST = ESC \). We use BEL as the terminator.
const OSC_RE = /\u001b\][^\u0007]*\u0007/g;
// Single-char ESC followed by an intermediate byte (0x20-0x2F) and a final
// byte (0x30-0x7E). For our purposes, the practical pattern is
// \u001b[@-_] which covers \u001b followed by a single byte in [@-_].
const SINGLE_ESC_RE = /\u001b[@-_]/g;

const CRLF_RE = /\r\n/g;

/**
 * @param {string | Buffer | null | undefined} input
 * @returns {string}
 */
function stripAnsi(input) {
  if (input === null || input === undefined) return '';
  const text = typeof input === 'string' ? input : Buffer.isBuffer(input) ? input.toString('utf8') : String(input);
  if (!text) return '';

  return text
    .replace(OSC_RE, '')
    .replace(CSI_RE, '')
    .replace(SINGLE_ESC_RE, '')
    .replace(CRLF_RE, '\n')
    .split('\n')
    .map((line) => line.replace(/\s+$/, ''))
    .join('\n');
}

module.exports = { stripAnsi };
