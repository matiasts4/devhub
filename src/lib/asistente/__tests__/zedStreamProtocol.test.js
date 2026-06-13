'use strict';

const { encodeZedSseEvent, parseZedSseBuffer } = require('../zedStreamProtocol');

describe('zedStreamProtocol', () => {
  test('encodeZedSseEvent frames JSON', () => {
    const frame = encodeZedSseEvent('tool_start', { tool: 'open_terminal' });
    expect(frame).toContain('event: tool_start');
    expect(frame).toContain('"tool":"open_terminal"');
  });

  test('parseZedSseBuffer extracts events', () => {
    const chunk =
      encodeZedSseEvent('done', { text: 'ok' }) + encodeZedSseEvent('error', { message: 'x' });
    const { events, remainder } = parseZedSseBuffer(chunk);
    expect(events).toHaveLength(2);
    expect(events[0].event).toBe('done');
    expect(events[0].data.text).toBe('ok');
    expect(remainder).toBe('');
  });
});
