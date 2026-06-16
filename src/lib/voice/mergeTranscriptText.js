/**
 * Merge overlapping partial STT delta chunks (Veloce-style).
 * Note: DevHub's audio_engine emits cumulative session text — use replace there, not this helper.
 *
 * @param {string} currentText
 * @param {string} incomingText
 * @returns {string}
 */
export function mergeTranscriptText(currentText, incomingText) {
  const current = (currentText || '').trim();
  const incoming = (incomingText || '').trim();

  if (!incoming) return current;
  if (!current) return incoming;
  if (incoming.startsWith(current)) return incoming;
  if (current.startsWith(incoming)) return current;
  if (current.endsWith(incoming)) return current;

  const currentLower = current.toLowerCase();
  const incomingLower = incoming.toLowerCase();
  const maxOverlap = Math.min(currentLower.length, incomingLower.length);
  let overlap = 0;

  for (let size = maxOverlap; size > 0; size -= 1) {
    if (currentLower.endsWith(incomingLower.slice(0, size))) {
      overlap = size;
      break;
    }
  }

  if (overlap > 0) {
    return `${current}${incoming.slice(overlap)}`.trim();
  }

  return `${current} ${incoming}`.trim();
}
