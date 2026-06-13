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

  test('does not treat TOOL: glued to a word (no boundary) as a call', () => {
    // No start-of-string, no whitespace, no '.', no '\n' before the
    // `TOOL:` — the parser must NOT swallow a mid-word occurrence.
    const raw = 'ThenIwillTOOL: open_url with url foo';
    expect(parseToolCalls(raw)).toEqual([]);
  });

  test('parses two consecutive tool blocks each with their own params', () => {
    const raw = 'TOOL: open_terminal\nPARAM: command=zsh\nTOOL: list_terminals';
    expect(parseToolCalls(raw)).toEqual([
      { name: 'open_terminal', input: { command: 'zsh' } },
      { name: 'list_terminals', input: {} },
    ]);
  });

  // ---- T-019: tolerant to inline TOOL:/PARAM: after prose ----
  // The model often glues `TOOL:` to the end of a sentence with just a
  // period (no newline). The parser used to require `^TOOL:` per line, so
  // those calls were silently dropped. These tests pin the new behavior.

  test('T-019: extracts TOOL: glued to end of prose with a period', () => {
    const raw = 'Voy con un ls para mostrarte.TOOL: open_terminal\n' + 'PARAM: command=ls -la';
    expect(parseToolCalls(raw)).toEqual([{ name: 'open_terminal', input: { command: 'ls -la' } }]);
  });

  test('T-019: extracts TOOL: preceded by a single space after prose', () => {
    const raw = 'Te explico. TOOL: open_url\n' + 'PARAM: url=https://github.com';
    expect(parseToolCalls(raw)).toEqual([
      { name: 'open_url', input: { url: 'https://github.com' } },
    ]);
  });

  test('T-019: extracts two tool calls when TOOL: appears twice (one inline, one on its own line)', () => {
    const raw =
      '¡Hola! Perfecto.TOOL: open_terminal\n' + 'PARAM: program=zsh\n' + 'TOOL: list_terminals';
    expect(parseToolCalls(raw)).toEqual([
      { name: 'open_terminal', input: { program: 'zsh' } },
      { name: 'list_terminals', input: {} },
    ]);
  });

  test('T-019: PARAM: without a preceding TOOL is still ignored', () => {
    const raw = 'Some prose. PARAM: command=ls';
    expect(parseToolCalls(raw)).toEqual([]);
  });

  test('T-019: reuses the log bug — glued TOOL: at end of message (no trailing newline)', () => {
    const raw =
      'Abro una nueva terminal para ti.TOOL: open_terminal\n' +
      'PARAM: program=zsh\n' +
      'PARAM: cwd=/home/matias/ArxonLabs/devhub';
    expect(parseToolCalls(raw)).toEqual([
      {
        name: 'open_terminal',
        input: {
          program: 'zsh',
          cwd: '/home/matias/ArxonLabs/devhub',
        },
      },
    ]);
  });

  // ---- T-034: tolerant to `:TOOL:` (Spanish prose, "abierta:TOOL: ...") ----
  // The model frequently writes a sentence that ends in `:` and immediately
  // follows it with `TOOL:` on the same line. The previous regex only
  // accepted whitespace, `.`, or start-of-input as the boundary, so these
  // calls were silently dropped and the user saw "Error: The string did
  // not match the expected pattern" downstream.

  test('T-034: extracts TOOL: glued to prose ending in a colon (Spanish ":TOOL:")', () => {
    const raw = 'Voy a abrir la terminal:TOOL: open_terminal\n' + 'PARAM: command=ls';
    expect(parseToolCalls(raw)).toEqual([{ name: 'open_terminal', input: { command: 'ls' } }]);
  });

  test('T-034: extracts PARAM: glued to prose ending in a colon', () => {
    // PARAM only attaches to a previously-seen TOOL — without one, it is
    // dropped (per the existing T-019 contract). With a prior TOOL, it
    // should bind. Verify the wired case.
    const raw =
      'TOOL: execute_in_terminal\n' +
      'Sesión ya abierta:PARAM: session_id=term-1780428735706-ilsr0\n' +
      'Comando a enviar:PARAM: input=ls';
    expect(parseToolCalls(raw)).toEqual([
      {
        name: 'execute_in_terminal',
        input: { session_id: 'term-1780428735706-ilsr0', input: 'ls' },
      },
    ]);
  });

  test('T-034: extracts TOOL: glued to prose ending in `,`, `;`, `?`, `!`', () => {
    expect(parseToolCalls('Vale,TOOL: open_url\nPARAM: url=https://github.com')).toEqual([
      { name: 'open_url', input: { url: 'https://github.com' } },
    ]);
    expect(parseToolCalls('¿Sigo?TOOL: list_terminals')).toEqual([
      { name: 'list_terminals', input: {} },
    ]);
    expect(parseToolCalls('Perfecto!TOOL: open_terminal\nPARAM: command=zsh')).toEqual([
      { name: 'open_terminal', input: { command: 'zsh' } },
    ]);
    expect(parseToolCalls('Y entonces;TOOL: open_terminal\nPARAM: program=bash')).toEqual([
      { name: 'open_terminal', input: { program: 'bash' } },
    ]);
  });
});
