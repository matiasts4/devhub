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
  const maxLines = Math.max(1, Number(options.maxLines) || 40);
  if (!buffer || typeof buffer !== 'string') return '';
  const sanitized = processCarriageReturns(buffer);
  const lines = sanitized.split('\n');
  if (lines.length <= maxLines) return sanitized;
  return lines.slice(-maxLines).join('\n');
}

export const DEFAULT_DETECTION_VIEWPORT_LINES = 40;
export const MAX_DETECTION_BUFFER_CHARS = 8192;
