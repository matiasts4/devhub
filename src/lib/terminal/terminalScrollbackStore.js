/**
 * terminalScrollbackStore.js — Per-session circular scrollback buffer.
 *
 * Phase 1 of terminal-engine-v2: in-memory 2 MiB ring buffer for PTY output.
 * Offset is monotonic (total bytes ever written). When the cap is reached,
 * oldest bytes are dropped so recent output is always available.
 */

const DEFAULT_MAX_SIZE = 2 * 1024 * 1024;

/**
 * Create a circular scrollback store for a terminal session.
 *
 * @param {string} sessionId - terminal session identifier (used for diagnostics)
 * @param {Object} options
 * @param {number} [options.maxSize=2*1024*1024] - maximum bytes retained in memory
 */
export function createScrollbackStore(sessionId, options = {}) {
  const maxSize = Number(options.maxSize) > 0 ? Number(options.maxSize) : DEFAULT_MAX_SIZE;

  // `startOffset` is the offset of the first byte currently in the buffer.
  // `endOffset` is the monotonic total of bytes ever appended.
  let startOffset = 0;
  let endOffset = 0;
  let buffer = '';

  /**
   * Append a chunk of PTY output.
   *
   * @param {string|Buffer} data - raw PTY output
   * @returns {{ startOffset: number, endOffset: number }} offset range for this chunk
   */
  function append(data) {
    let chunk = typeof data === 'string' ? data : (data?.toString?.('utf-8') ?? '');
    if (chunk.length === 0) {
      return { startOffset: endOffset, endOffset };
    }

    const chunkStartOffset = endOffset;

    const originalChunkLength = chunk.length;

    // If the chunk itself is larger than the cap, keep only the tail.
    if (originalChunkLength > maxSize) {
      chunk = chunk.slice(-maxSize);
      buffer = chunk;
      endOffset = chunkStartOffset + originalChunkLength;
      startOffset = endOffset - maxSize;
      return { startOffset: chunkStartOffset, endOffset };
    }

    // Evict oldest bytes until the new chunk fits.
    const combinedLength = buffer.length + originalChunkLength;
    if (combinedLength > maxSize) {
      const toEvict = combinedLength - maxSize;
      buffer = buffer.slice(toEvict);
      startOffset += toEvict;
    }

    buffer += chunk;
    endOffset = chunkStartOffset + originalChunkLength;
    return { startOffset: chunkStartOffset, endOffset };
  }

  /**
   * Read bytes from the requested offset forward.
   *
   * @param {number} fromOffset - offset to start reading from
   * @param {Object} options
   * @param {'utf-8'|'base64'} [options.encoding='utf-8'] - output encoding
   * @returns {string} data still present in the buffer (empty if fromOffset is ahead)
   */
  function read(fromOffset, options = {}) {
    const encoding = options.encoding || 'utf-8';
    if (buffer.length === 0) return '';

    const clampedOffset = Math.max(startOffset, Number(fromOffset) || 0);
    if (clampedOffset >= endOffset) return '';

    const slice = buffer.slice(clampedOffset - startOffset);
    if (encoding === 'base64') {
      return Buffer.from(slice, 'utf-8').toString('base64');
    }
    return slice;
  }

  /** @returns {number} monotonic offset (total bytes ever written) */
  function getOffset() {
    return endOffset;
  }

  /** @returns {number} current retained buffer size in bytes */
  function getSize() {
    return buffer.length;
  }

  /** Empty the retained buffer without resetting the monotonic offset. */
  function clear() {
    buffer = '';
    startOffset = endOffset;
  }

  return {
    sessionId,
    append,
    read,
    getOffset,
    getSize,
    clear,
  };
}
