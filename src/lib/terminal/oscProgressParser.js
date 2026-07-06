/* eslint-disable no-control-regex -- OSC sequences */
/**
 * oscProgressParser — capture OSC progress payloads (e.g. Claude idle hint ^4;0).
 */

const OSC_PROGRESS_RE = /\x1b\](\d+);([^\x07\x1b]*)(?:\x07|\x1b\\)/g;
const MAX_OSC_PROGRESS_BUFFER = 512;

/**
 * @param {object} session — mutable `.oscProgress`, `._oscProgressBuffer`
 * @param {string} chunk
 */
export function processOscProgress(session, chunk) {
  if (typeof chunk !== 'string' || !chunk) return;

  const buffer = (session._oscProgressBuffer || '') + chunk;
  OSC_PROGRESS_RE.lastIndex = 0;
  let match;
  let lastIndex = 0;

  while ((match = OSC_PROGRESS_RE.exec(buffer)) !== null) {
    const code = match[1];
    const payload = match[2] || '';
    if (code === '9' || code === '4') {
      session.oscProgress = payload;
    }
    lastIndex = OSC_PROGRESS_RE.lastIndex;
  }

  session._oscProgressBuffer = buffer.slice(lastIndex).slice(-MAX_OSC_PROGRESS_BUFFER);
}
