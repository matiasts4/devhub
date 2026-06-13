/**
 * SSE framing for Zed chat streaming (Phase 4).
 *
 * Event types: tool_start | tool_result | text_delta | done | error
 */

export const ZED_STREAM_EVENTS = Object.freeze([
  'tool_start',
  'tool_result',
  'text_delta',
  'done',
  'error',
]);

/**
 * @param {string} event
 * @param {unknown} data
 * @returns {string}
 */
export function encodeZedSseEvent(event, data) {
  return `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
}

/**
 * Parse accumulated SSE buffer into events + remainder.
 *
 * @param {string} buffer
 * @returns {{ events: Array<{ event: string, data: unknown }>, remainder: string }}
 */
export function parseZedSseBuffer(buffer) {
  const events = [];
  let rest = buffer;
  let idx;
  while ((idx = rest.indexOf('\n\n')) !== -1) {
    const chunk = rest.slice(0, idx);
    rest = rest.slice(idx + 2);
    let event = 'message';
    let dataLine = '';
    for (const line of chunk.split('\n')) {
      if (line.startsWith('event:')) event = line.slice(6).trim();
      if (line.startsWith('data:')) dataLine = line.slice(5).trim();
    }
    if (!dataLine) continue;
    try {
      events.push({ event, data: JSON.parse(dataLine) });
    } catch {
      events.push({ event, data: dataLine });
    }
  }
  return { events, remainder: rest };
}

/**
 * @param {ReadableStreamDefaultReader<Uint8Array>} reader
 * @param {(evt: { event: string, data: unknown }) => void} onEvent
 * @returns {Promise<void>}
 */
export async function consumeZedSseStream(reader, onEvent) {
  const decoder = new TextDecoder();
  let buffer = '';
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const parsed = parseZedSseBuffer(buffer);
    buffer = parsed.remainder;
    for (const evt of parsed.events) onEvent(evt);
  }
  if (buffer.trim()) {
    const parsed = parseZedSseBuffer(`${buffer}\n\n`);
    for (const evt of parsed.events) onEvent(evt);
  }
}
