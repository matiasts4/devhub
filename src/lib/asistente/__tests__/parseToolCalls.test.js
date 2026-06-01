const { parseToolCalls } = require('../parseToolCalls');

describe('parseToolCalls', () => {
  test('returns empty array for input with no TOOL lines', () => {
    expect(parseToolCalls('Sure, here you go.')).toEqual([]);
  });

  test('returns empty array for empty string', () => {
    expect(parseToolCalls('')).toEqual([]);
  });

  test('returns empty array for null/undefined', () => {
    expect(parseToolCalls(null)).toEqual([]);
    expect(parseToolCalls(undefined)).toEqual([]);
  });

  test('parses simple single tool call', () => {
    const raw = 'TOOL: open_url\nPARAM: url=https://example.com';
    expect(parseToolCalls(raw)).toEqual([
      { name: 'open_url', input: { url: 'https://example.com' } },
    ]);
  });

  test('preserves value containing = and ://', () => {
    const raw = 'TOOL: open_url\nPARAM: url=https://github.com/foo?a=1&b=2';
    expect(parseToolCalls(raw)).toEqual([
      { name: 'open_url', input: { url: 'https://github.com/foo?a=1&b=2' } },
    ]);
  });

  test('strips a single matched pair of double quotes', () => {
    const raw = 'TOOL: execute_in_terminal\nPARAM: command="echo hello world"';
    expect(parseToolCalls(raw)).toEqual([
      { name: 'execute_in_terminal', input: { command: 'echo hello world' } },
    ]);
  });

  test('strips a single matched pair of single quotes', () => {
    const raw = "TOOL: foo\nPARAM: bar='baz qux'";
    expect(parseToolCalls(raw)).toEqual([{ name: 'foo', input: { bar: 'baz qux' } }]);
  });

  test('leaves a single quote unmatched (does not strip)', () => {
    const raw = "TOOL: foo\nPARAM: bar=asymmetric'quote";
    expect(parseToolCalls(raw)).toEqual([{ name: 'foo', input: { bar: "asymmetric'quote" } }]);
  });

  test('parses multiple params for the same tool', () => {
    const raw = 'TOOL: open_terminal\nPARAM: command=zsh\nPARAM: cwd=/tmp/devhub-x';
    expect(parseToolCalls(raw)).toEqual([
      {
        name: 'open_terminal',
        input: { command: 'zsh', cwd: '/tmp/devhub-x' },
      },
    ]);
  });

  test('parses two TOOL blocks in one response', () => {
    const raw = 'TOOL: list_terminals\nTOOL: get_swarm_status';
    expect(parseToolCalls(raw)).toEqual([
      { name: 'list_terminals', input: {} },
      { name: 'get_swarm_status', input: {} },
    ]);
  });

  test('preserves empty value as empty string', () => {
    const raw = 'TOOL: close_terminal\nPARAM: session_id=';
    expect(parseToolCalls(raw)).toEqual([{ name: 'close_terminal', input: { session_id: '' } }]);
  });

  test('handles trailing whitespace and inner blanks', () => {
    const raw = 'TOOL: open_url   \n  \n  PARAM: url=foo   ';
    expect(parseToolCalls(raw)).toEqual([{ name: 'open_url', input: { url: 'foo' } }]);
  });

  test('preserves PARAM: with no current TOOL (ignored, not associated)', () => {
    const raw = 'PARAM: foo=bar\nTOOL: open_url\nPARAM: url=ok';
    expect(parseToolCalls(raw)).toEqual([{ name: 'open_url', input: { url: 'ok' } }]);
  });

  test('preserves whitespace inside a value (leading/trailing trimmed only at the ends)', () => {
    const raw = 'TOOL: open_terminal\nPARAM: command=npm test --watch';
    expect(parseToolCalls(raw)).toEqual([
      { name: 'open_terminal', input: { command: 'npm test --watch' } },
    ]);
  });

  test('does not treat TOOL: text inside prose as a call (line must start with TOOL:)', () => {
    const raw = 'Then I will TOOL: open_url with url foo';
    expect(parseToolCalls(raw)).toEqual([]);
  });

  test('parses two consecutive tool blocks each with their own params', () => {
    const raw = 'TOOL: open_terminal\nPARAM: command=zsh\nTOOL: list_terminals';
    expect(parseToolCalls(raw)).toEqual([
      { name: 'open_terminal', input: { command: 'zsh' } },
      { name: 'list_terminals', input: {} },
    ]);
  });
});
