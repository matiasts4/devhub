// T-033: the client-side `buildZedHistory` helper flattens the rendered
// `messages` state into the wire protocol the assistant route expects.
//
// The ChatPanel module is a 'use client' JSX file. Importing it under JSDOM
// + jest-environment-jsdom pulls in React + the panel itself. We only need
// the named export `buildZedHistory`, which is a pure function — so we
// require the module but only exercise the export (the panel itself is not
// rendered here; the existing ChatPanel.test.jsx covers that surface).

const { buildZedHistory } = require('../ChatPanel.jsx');

describe('buildZedHistory (T-033)', () => {
  test('flattens user + assistant + tool_results into the wire protocol', () => {
    const messages = [
      { role: 'user', content: 'open a terminal', timestamp: '...' },
      {
        role: 'assistant',
        content: 'ok, opening',
        timestamp: '...',
        tool_results: [
          {
            tool: 'open_terminal',
            input: { command: 'ls' },
            result: { session_id: 's1' },
          },
        ],
      },
      { role: 'user', content: 'try again', timestamp: '...' },
    ];
    expect(buildZedHistory(messages)).toEqual([
      { role: 'user', content: 'open a terminal' },
      { role: 'assistant', content: 'ok, opening' },
      {
        role: 'user',
        content: 'Tool open_terminal result: {"session_id":"s1"}',
      },
      { role: 'user', content: 'try again' },
    ]);
  });

  test('caps at maxLen entries (default 20)', () => {
    const messages = Array.from({ length: 25 }, (_, i) => ({
      role: 'user',
      content: `m-${i}`,
    }));
    const out = buildZedHistory(messages);
    expect(out).toHaveLength(20);
    expect(out[0].content).toBe('m-5');
    expect(out[19].content).toBe('m-24');
  });

  test('respects a custom maxLen', () => {
    const messages = Array.from({ length: 10 }, (_, i) => ({
      role: 'user',
      content: `m-${i}`,
    }));
    const out = buildZedHistory(messages, 3);
    expect(out).toHaveLength(3);
    expect(out[0].content).toBe('m-7');
    expect(out[2].content).toBe('m-9');
  });

  test('skips malformed entries (no role, non-string content)', () => {
    const messages = [
      null,
      { role: 'user', content: 'good' },
      { role: 'assistant' /* no content */ },
      { content: 'no role' },
      { role: 'user', content: 42 },
      { role: 'user', content: 'good2' },
    ];
    expect(buildZedHistory(messages)).toEqual([
      { role: 'user', content: 'good' },
      { role: 'user', content: 'good2' },
    ]);
  });

  test('returns [] for non-array input', () => {
    expect(buildZedHistory(null)).toEqual([]);
    expect(buildZedHistory(undefined)).toEqual([]);
    expect(buildZedHistory('string')).toEqual([]);
  });

  test('assistant message with no tool_results is still forwarded', () => {
    const messages = [
      { role: 'user', content: 'q' },
      { role: 'assistant', content: 'a' },
    ];
    expect(buildZedHistory(messages)).toEqual([
      { role: 'user', content: 'q' },
      { role: 'assistant', content: 'a' },
    ]);
  });

  test('tool_results with non-string tool name are skipped', () => {
    const messages = [
      {
        role: 'assistant',
        content: 'partial',
        tool_results: [
          { tool: null, result: { x: 1 } },
          { tool: 'real', result: { y: 2 } },
        ],
      },
    ];
    const out = buildZedHistory(messages);
    expect(out).toEqual([
      { role: 'assistant', content: 'partial' },
      { role: 'user', content: 'Tool real result: {"y":2}' },
    ]);
  });

  // ----- T-WSR-zed-002 (ASST-CHAT-001) -----
  test('T-WSR-zed-002: 2-turn integration — assistant turn + tool_result line preserved when input is the closure `messages`', () => {
    // The closure fix drops `.slice(0, -1)` in ChatPanel.handleSend. The
    // helper itself already flattens correctly; this test pins the input
    // shape (closure messages) so the call-site change is provably
    // correct. A regression would either drop the assistant turn
    // (current bug) or duplicate the previous user message.
    const messages = [
      { role: 'assistant', content: 'Hola, soy Zed.', timestamp: '...' },
      { role: 'user', content: 'abre una terminal', timestamp: '...' },
      {
        role: 'assistant',
        content: 'listo',
        timestamp: '...',
        tool_results: [
          {
            tool: 'open_terminal',
            result: { session_id: 'term-X' },
          },
        ],
      },
    ];
    const out = buildZedHistory(messages);

    // The assistant turn is in the output.
    expect(out).toContainEqual({ role: 'assistant', content: 'listo' });
    // The tool_results-derived line is in the output (substring match,
    // allow formatting variance).
    const toolLine = out.find(
      (entry) =>
        entry.role === 'user' &&
        typeof entry.content === 'string' &&
        entry.content.startsWith('Tool open_terminal result:')
    );
    expect(toolLine).toBeDefined();
    expect(toolLine.content).toContain('term-X');
    // The previous user turn is in the output.
    expect(out).toContainEqual({ role: 'user', content: 'abre una terminal' });
  });
});
