/**
 * Tests for `summarizeTerminal` tool (ZTT-005).
 *
 * Covers:
 *   - ANSI strip on input via local stripAnsi (no raw escape in output)
 *   - 8KB cap on captured output
 *   - OpenCode footer heuristic → status:'waiting_user_input'
 *   - Non-OpenCode TUI without recognized footer → status:'unknown'
 *   - Terminal-gone / 404 returns error not_found
 *   - 2s in-memory cache hit returns the same digest without re-capturing
 *   - Cache miss after 2s TTL re-captures
 *
 * The module under test is imported as ESM; babel-jest downlevels
 * `import` to `require` so jest can resolve it.
 */

const {
  summarizeTerminalTool,
  _resetSummarizeCacheForTests,
} = require('../../tools/summarizeTerminal');

const REAL_FETCH = global.fetch;

afterEach(() => {
  global.fetch = REAL_FETCH;
  _resetSummarizeCacheForTests();
  jest.clearAllMocks();
});

function mockFetch(impl) {
  global.fetch = jest.fn(impl);
}

// Capture endpoint shape (matches /api/terminal/session/[id]/capture):
function captureOk(output, sessionId = 'p2') {
  return {
    ok: true,
    status: 200,
    json: async () => ({ output, session_id: sessionId, source: 'tty' }),
  };
}

function captureNotFound() {
  return {
    ok: false,
    status: 404,
    json: async () => ({ error: 'unknown session' }),
  };
}

describe('summarize_terminal (summarizeTerminalTool) — ZTT-005', () => {
  test('requires either terminalId or name (returns error when both missing)', async () => {
    const calls = [];
    mockFetch(async (...args) => {
      calls.push(args);
      return captureOk('hello');
    });
    const result = await summarizeTerminalTool.execute({}, {});
    expect(calls).toHaveLength(0);
    expect(result.error).toMatch(/missing required parameter/);
  });

  test('captures output via GET /api/terminal/session/:id/capture', async () => {
    mockFetch(async () => captureOk('terminal output line\n> ', 'p2'));
    const result = await summarizeTerminalTool.execute({ terminalId: 'p2' }, {});
    expect(result.terminalId).toBe('p2');
    expect(result.status).toBeDefined();
    // Output passed through stripAnsi; we should not leak raw escapes.
    expect(result).not.toHaveProperty('output');
  });

  test('strips ANSI escapes from the captured output (no \\u001b[ leaks)', async () => {
    // OpenCode footer is recognized in plain text after stripping.
    const raw = '\u001b[36mChoose:\u001b[0m [3] three PRs  [5] five PRs\u001b[0m';
    mockFetch(async () => captureOk(raw, 'p2'));
    const result = await summarizeTerminalTool.execute({ terminalId: 'p2' }, {});
    expect(result.status).toBe('waiting_user_input');
    // No string field leaks a raw ESC character.
    for (const [k, v] of Object.entries(result)) {
      if (typeof v === 'string') {
        // eslint-disable-next-line no-control-regex
        expect(v).not.toMatch(/\u001b\[/);
        // Test guards: be explicit so a future regression is obvious.
        expect({ k }).toBeDefined();
      }
    }
  });

  test('caps captured output at 8KB (does not echo raw 12KB text to model)', async () => {
    const big = 'x'.repeat(12_000);
    mockFetch(async () => captureOk(big, 'p2'));
    const result = await summarizeTerminalTool.execute({ terminalId: 'p2' }, {});
    // result has no .output; the digest itself is bounded. The cap matters
    // when a downstream field includes a tail or excerpt. We assert that
    // the digest is small (heuristic) and that the original 12KB string
    // was NOT echoed verbatim into any field.
    const allText = JSON.stringify(result);
    expect(allText.length).toBeLessThan(8000);
    // And we should not see the full 12k of x's in any string field.
    expect(allText).not.toContain('x'.repeat(2000));
  });

  test("OpenCode footer 'Choose:' → status:'waiting_user_input' with waitingFor hint", async () => {
    mockFetch(async () =>
      captureOk('OpenCode TUI\n\u001b[1mChoose:\u001b[0m [3] three PRs  [5] five PRs\n> ', 'p2')
    );
    const result = await summarizeTerminalTool.execute({ terminalId: 'p2' }, {});
    expect(result.status).toBe('waiting_user_input');
    expect(typeof result.waitingFor).toBe('string');
    expect(result.waitingFor.length).toBeGreaterThan(0);
  });

  test("OpenCode footer 'y/n' / 'confirm' / 'waiting' → status:'waiting_user_input'", async () => {
    for (const footer of ['Continue? (y/n)', 'Please confirm to proceed', 'waiting for input…']) {
      _resetSummarizeCacheForTests();
      mockFetch(async () => captureOk(`tail line\n${footer}\n> `, 'p3'));
      const result = await summarizeTerminalTool.execute({ terminalId: 'p3' }, {});
      expect(result.status).toBe('waiting_user_input');
    }
  });

  test("non-OpenCode TUI (program:'bash', no footer) → status:'unknown'", async () => {
    mockFetch(async () => captureOk('user@host:~$ some-shell-prompt\n', 'p4'));
    const result = await summarizeTerminalTool.execute({ terminalId: 'p4', program: 'bash' }, {});
    expect(result.status).toBe('unknown');
  });

  test('empty/blank captured output → status:unknown (no crash)', async () => {
    mockFetch(async () => captureOk('\n\n  \n', 'p5'));
    const result = await summarizeTerminalTool.execute({ terminalId: 'p5' }, {});
    expect(result.status).toBe('unknown');
  });

  test('terminal gone (404) → Spanish not_found, no HTTP retry', async () => {
    const calls = [];
    mockFetch(async (...args) => {
      calls.push(args);
      return captureNotFound();
    });
    const result = await summarizeTerminalTool.execute({ terminalId: 'Maverick' }, {});
    expect(calls).toHaveLength(1);
    expect(result.error).toBe('not_found');
    // Spanish message from formatZedToolError or our own canonical.
    expect(typeof result.message).toBe('string');
    expect(result.message.length).toBeGreaterThan(0);
  });

  test('2s cache: second call within 2s returns cached digest without re-capturing', async () => {
    const calls = [];
    mockFetch(async (...args) => {
      calls.push(args);
      return captureOk('OpenCode TUI\nChoose: [1] a [2] b\n> ', 'p6');
    });
    const first = await summarizeTerminalTool.execute({ terminalId: 'p6' }, {});
    const second = await summarizeTerminalTool.execute({ terminalId: 'p6' }, {});
    // Only one capture call total — the second hit the cache.
    expect(calls).toHaveLength(1);
    expect(second).toEqual(first);
  });

  test('cache TTL: after 2.1s the cache misses and re-captures', async () => {
    // Mock Date.now() directly (Jest 27 useFakeTimers alone does not fake
    // Date.now by default; the cache uses Date.now, not setTimeout).
    let fakeNow = 1_000_000;
    const realNow = Date.now;
    const nowSpy = jest.spyOn(Date, 'now').mockImplementation(() => fakeNow);
    try {
      const calls = [];
      mockFetch(async (...args) => {
        calls.push(args);
        return captureOk('OpenCode TUI\nChoose: [1] a\n> ', 'p7');
      });
      await summarizeTerminalTool.execute({ terminalId: 'p7' }, {});
      expect(calls).toHaveLength(1);
      // Advance fake time past 2s TTL.
      fakeNow += 2100;
      // Switch to a different output to prove the cache didn't just return
      // the same digest because nothing changed.
      mockFetch(async (...args) => {
        calls.push(args);
        return captureOk('OpenCode TUI\nChoose: [1] a\n> changed', 'p7');
      });
      const second = await summarizeTerminalTool.execute({ terminalId: 'p7' }, {});
      expect(calls).toHaveLength(2);
      expect(second).toBeDefined();
    } finally {
      nowSpy.mockRestore();
      Date.now = realNow;
    }
  });

  // ----- tail excerpt: the digest must carry cleaned content so the model
  // can answer "¿qué me respondió el agente?" -----

  test('digest includes cleaned `tail` with the agent reply text', async () => {
    const raw = 'welcome\n\u001b[32mEl agente dijo: terminé la tarea 14\u001b[0m\nlisto\n';
    mockFetch(async () => captureOk(raw, 'p8'));
    const result = await summarizeTerminalTool.execute({ terminalId: 'p8' }, {});
    expect(typeof result.tail).toBe('string');
    expect(result.tail).toContain('El agente dijo: terminé la tarea 14');
    // eslint-disable-next-line no-control-regex
    expect(result.tail).not.toMatch(/\u001b\[/);
  });

  test('tail is capped (~1500 chars) and keeps the END of the buffer', async () => {
    const big = `${'x'.repeat(9000)}\nRESPUESTA FINAL DEL AGENTE`;
    mockFetch(async () => captureOk(big, 'p9'));
    const result = await summarizeTerminalTool.execute({ terminalId: 'p9' }, {});
    expect(result.tail.length).toBeLessThanOrEqual(1501); // excerpt + leading ellipsis
    expect(result.tail).toContain('RESPUESTA FINAL DEL AGENTE');
  });

  test('blank capture → no tail field', async () => {
    mockFetch(async () => captureOk('\n \n', 'p10'));
    const result = await summarizeTerminalTool.execute({ terminalId: 'p10' }, {});
    expect(result.tail).toBeUndefined();
  });

  test('name lookup: {name:"Chase"} resolves via /api/terminal/processes first', async () => {
    // First fetch → /api/terminal/processes for the list (resolver).
    // Second fetch → /api/terminal/session/p7/capture for the body.
    const calls = [];
    mockFetch(async (url) => {
      calls.push(url);
      if (typeof url === 'string' && url.includes('/api/terminal/processes')) {
        return {
          ok: true,
          status: 200,
          json: async () => ({
            processes: [{ terminalId: 'p7', displayName: 'Chase' }],
          }),
        };
      }
      return captureOk('Choose: [1] a\n> ', 'p7');
    });
    const result = await summarizeTerminalTool.execute({ name: 'Chase' }, {});
    expect(result.terminalId).toBe('p7');
    expect(result.status).toBe('waiting_user_input');
    // At least one call to /processes and one to /capture.
    const hasProc = calls.some(
      (u) => typeof u === 'string' && u.includes('/api/terminal/processes')
    );
    const hasCap = calls.some(
      (u) => typeof u === 'string' && u.includes('/api/terminal/session/p7/capture')
    );
    expect(hasProc).toBe(true);
    expect(hasCap).toBe(true);
  });
});
