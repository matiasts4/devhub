/**
 * oscCwdParser.js — Streaming OSC 7 cwd parser.
 *
 * OSC 7 format: ESC ] 7 ; payload BEL
 *            or ESC ] 7 ; payload ESC \
 *
 * Payload forms:
 *   - file://hostname/path
 *   - bare path
 *
 * The parser is stateful so it can handle sequences split across PTY chunks.
 */

import os from 'os';

const OSC7_PREFIX = '\x1b]7;';

/**
 * Normalize a path extracted from an OSC 7 payload.
 * Handles URL decoding, double slashes, and Windows drive-letter paths.
 */
function normalizeOsc7Path(pathPart) {
  if (pathPart == null || pathPart.length === 0) return null;

  let decoded;
  try {
    decoded = decodeURIComponent(pathPart);
  } catch {
    decoded = pathPart;
  }

  // Normalize double slashes at the beginning to single slash.
  if (decoded.startsWith('//')) {
    decoded = decoded.substring(1);
  }

  // Handle Windows paths (e.g., /C:/... or /D:\...)
  if (/^\/[a-zA-Z]:[\\/]/.test(decoded)) {
    decoded = decoded.substring(1).replace(/\\/g, '/');
  }

  // Handle UNC paths (e.g., /\\server\share)
  if (decoded.startsWith('/\\\\')) {
    decoded = decoded.substring(1);
  }

  return decoded || null;
}

/**
 * Extract cwd from a single OSC 7 payload string.
 */
function parseOsc7Payload(payload) {
  if (!payload || payload.length === 0) return null;

  if (payload.startsWith('file://')) {
    const withoutScheme = payload.slice('file://'.length);
    const slashIndex = withoutScheme.indexOf('/');
    const pathPart = slashIndex >= 0 ? withoutScheme.slice(slashIndex) : withoutScheme;
    return normalizeOsc7Path(pathPart);
  }

  // Bare path form.
  return normalizeOsc7Path(payload) || payload || null;
}

/**
 * Find the end of the next OSC 7 sequence in `text` starting at `start`.
 * Returns the index just past the terminator, or -1 if no complete sequence.
 */
function findOsc7End(text, start) {
  for (let i = start; i < text.length; i += 1) {
    const ch = text[i];
    if (ch === '\x07') return i + 1;

    // ST terminator: ESC \
    if (ch === '\x1b' && i + 1 < text.length && text[i + 1] === '\\') {
      return i + 2;
    }
  }
  return -1;
}

/**
 * Parse a chunk of PTY output and extract any complete OSC 7 cwd sequences.
 *
 * @param {string} chunk
 * @returns {{ cwd: string|null, consumed: number }}
 *   cwd: the last cwd extracted from complete sequences in the chunk
 *   consumed: total bytes that were part of complete OSC 7 sequences
 */
export function parseOscCwd(chunk) {
  const parser = createOscCwdParser();
  const parsed = parser.parse(chunk);
  const flushed = parser.flush();
  return {
    cwd: flushed.cwd ?? parsed.cwd,
    consumed: parsed.consumed + flushed.consumed,
  };
}

/**
 * Build the OSC 7 cwd sequence for a given cwd and hostname.
 */
export function buildOsc7CwdString(cwd, hostname = os.hostname()) {
  const safeCwd = String(cwd || '');
  const safeHost = String(hostname || 'localhost');
  return `\x1b]7;file://${safeHost}${safeCwd}\x1b\\`;
}

/**
 * Create a streaming OSC 7 cwd parser.
 *
 * @returns {{
 *   parse: (chunk: string) => { cwd: string|null, consumed: number },
 *   flush: () => { cwd: string|null, consumed: number }
 * }}
 */
export function createOscCwdParser() {
  let buffer = '';

  function consumeCompleteSequences() {
    let lastCwd = null;
    let totalConsumed = 0;
    let scan = 0;

    while (scan < buffer.length) {
      const prefixIndex = buffer.indexOf(OSC7_PREFIX, scan);
      if (prefixIndex === -1) {
        // No more OSC 7 starts; discard non-OSC prefix up to this point.
        scan = buffer.length;
        break;
      }

      // Discard non-OSC bytes before this prefix; they are not consumed as
      // OSC data but they are removed from the buffer.
      scan = prefixIndex;

      const payloadStart = prefixIndex + OSC7_PREFIX.length;
      const endIndex = findOsc7End(buffer, payloadStart);
      if (endIndex === -1) {
        // Incomplete OSC 7 sequence; keep the prefix onward in the buffer.
        break;
      }

      const terminatorLen = buffer[endIndex - 1] === '\x07' ? 1 : 2;
      const payload = buffer.slice(payloadStart, endIndex - terminatorLen);
      const cwd = parseOsc7Payload(payload);
      if (cwd) {
        lastCwd = cwd;
      }

      totalConsumed += endIndex - prefixIndex;
      scan = endIndex;
    }

    if (scan > 0) {
      buffer = buffer.slice(scan);
    }

    return { cwd: lastCwd, consumed: totalConsumed };
  }

  function parseChunk(chunk) {
    if (typeof chunk !== 'string') return { cwd: null, consumed: 0 };
    buffer += chunk;
    return consumeCompleteSequences();
  }

  function flush() {
    const result = consumeCompleteSequences();
    // If an incomplete OSC 7 remains, clear it.
    if (buffer.includes(OSC7_PREFIX)) {
      buffer = '';
    }
    return result;
  }

  return { parse: parseChunk, flush };
}
