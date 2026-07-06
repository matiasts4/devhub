/**
 * extractBottomViewport — slice detection input to approximate herdr bottom viewport.
 *
 * @param {string} buffer — accumulated terminal text
 * @param {{ maxLines?: number }} [options]
 * @returns {string}
 */
export function extractBottomViewport(buffer, options = {}) {
  const maxLines = Math.max(1, Number(options.maxLines) || 40);
  if (!buffer || typeof buffer !== 'string') return '';
  const lines = buffer.split('\n');
  if (lines.length <= maxLines) return buffer;
  return lines.slice(-maxLines).join('\n');
}

export const DEFAULT_DETECTION_VIEWPORT_LINES = 40;
export const MAX_DETECTION_BUFFER_CHARS = 8192;
