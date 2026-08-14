const {
  ensureAgentDetectionSession,
  ingestAgentDetectionFromFilteredOutput,
  notifyUserInput,
  tickAgentDetection,
  DEFAULT_AGENT_QUIESCENCE_MS,
} = require('../sessionAgentDetector.js');

function makeSession(agentType, extra = {}) {
  return ensureAgentDetectionSession({
    agentType,
    title: '',
    agentTuiState: null,
    agentTuiStateAt: null,
    // tickAgentDetection force-publishes idle for dead PTYs; keep a live fake.
    pty: { pid: 4321 },
    ptyPid: 4321,
    ...extra,
  });
}

// The state machine re-publishes stable visible signals every 800ms, so a
// non-null publish of 'running' is fine — what matters is it is NEVER idle.
function expectNotIdle(result) {
  if (result.published) {
    expect(result.published.state).not.toBe('idle');
  }
  expect(result.agentTuiState).not.toBe('idle');
}

describe('sessionAgentDetector', () => {
  test('kimi approval screen publishes blocked', () => {
    const session = makeSession('kimi');

    const chunk = ['run this command?', '↵ confirm', ' choose', 'approve   reject'].join('\n');

    const first = ingestAgentDetectionFromFilteredOutput(session, chunk, 1000);
    expect(first.agentTuiState).toBe('blocked');
    expect(first.published).not.toBeNull();

    const second = ingestAgentDetectionFromFilteredOutput(session, '\n', 1001);
    expect(second.agentTuiState).toBe('blocked');
  });

  test('two isolated sessions with same chunks get same state', () => {
    const chunk = ['run this command?', '↵ confirm', ' choose', 'approve   reject'].join('\n');

    const a = makeSession('kimi');
    const b = makeSession('kimi');

    ingestAgentDetectionFromFilteredOutput(a, chunk, 2000);
    ingestAgentDetectionFromFilteredOutput(b, chunk, 2000);

    expect(a.agentTuiState).toBe(b.agentTuiState);
    expect(a.agentTuiStateAt).toBe(b.agentTuiStateAt);
  });

  test('W4: no-match screen for an agent with manifest is sticky (never publishes idle)', () => {
    const session = makeSession('kimi');
    const result = ingestAgentDetectionFromFilteredOutput(
      session,
      'plain unrelated output with no agent chrome',
      3000
    );
    expect(result.published).toBeNull();
    expect(result.agentTuiState).toBeNull();
    expect(session.agentTuiState ?? null).toBeNull();
  });

  describe('W6 — CR collapse happens before stripAnsi in the real ingest path', () => {
    // NOTE: raw \r bytes are inlined (not a fixture file) so git CRLF
    // normalization cannot silently rewrite them.

    test('antigravity: CR-overwritten braille spinner + footer still detects running', () => {
      const session = makeSession('agy');
      const raw =
        '\x1b[1mWriting response...\x1b[0m\r\n\r\n' +
        '\x1b[2K\r⠋ Gathering context\x1b[2K\r⠇ Writing\r\n' +
        '\x1b[2mesc to cancel\x1b[0m\r\n' +
        'accept-edits · Gemini 3.5 Flash\r\n';

      const result = ingestAgentDetectionFromFilteredOutput(session, raw, 1000);
      expect(result.agentTuiState).toBe('running');
      expect(result.published).not.toBeNull();
      expect(result.published.state).toBe('running');
    });

    test('antigravity: CR-overwritten anchored idle prompt still detects idle', () => {
      const session = makeSession('agy');
      // Spinner line is overwritten in place by the idle prompt via \r. Without
      // CR collapse the frames fuse into "⠋ Thinkingantigravity>" and the
      // anchored lineRegex (^antigravity>) fails.
      const raw =
        'Task completed successfully.\r\n\r\n' + '\x1b[2K\r⠋ Thinking\x1b[2K\rantigravity> \r\n';

      const result = ingestAgentDetectionFromFilteredOutput(session, raw, 1000);
      expect(result.agentTuiState).toBe('idle');
      expect(result.published).not.toBeNull();
      expect(result.published.state).toBe('idle');
    });

    test('antigravity: running then CR-redrawn idle footer transitions running -> idle', () => {
      const session = makeSession('agy');
      const runningRaw =
        'Writing response...\r\n\r\n' +
        '\x1b[2K\r⠋ Gathering context\x1b[2K\r⠇ Writing\r\n' +
        'esc to cancel\r\n' +
        'accept-edits · Gemini 3.5 Flash\r\n';
      const first = ingestAgentDetectionFromFilteredOutput(session, runningRaw, 1000);
      expect(first.agentTuiState).toBe('running');

      const idleRaw =
        '\x1b[2K\rHere is the story you asked for.\r\n' +
        'It has a few lines of wrapped text.\r\n' +
        'And one more concluding line.\r\n' +
        '\r\n' +
        '\x1b[2K\r? for shortcuts\r\n' +
        'accept-edits · Gemini 3.5 Flash\r\n';
      const second = ingestAgentDetectionFromFilteredOutput(session, idleRaw, 2000);
      // Anti-flap dwell: the first idle candidate is held, state stays running
      expect(second.published).toBeNull();
      expect(second.agentTuiState).toBe('running');
      // Once the candidate persists past the dwell window, it publishes
      const third = ingestAgentDetectionFromFilteredOutput(session, idleRaw, 3600);
      expect(third.agentTuiState).toBe('idle');
      expect(third.published).not.toBeNull();
      expect(third.published.state).toBe('idle');
    });

    test('kimi: CR-overwritten moon spinner frames still detect running', () => {
      const session = makeSession('kimi');
      // Moon spinner redraws one char per frame with \r; fused frames ("🌕🌖")
      // break the anchored ^\s*(🌕|…)\s*$ rule.
      const raw = '\x1b[2K\r🌕\x1b[2K\r🌖\r\n';
      const result = ingestAgentDetectionFromFilteredOutput(session, raw, 1000);
      expect(result.agentTuiState).toBe('running');
      expect(result.published).not.toBeNull();
      expect(result.published.state).toBe('running');
    });
  });

  describe('W4 — activity-based quiescence', () => {
    const AGY_WORKING = 'writing a story…\n\nesc to cancel\naccept-edits · Gemini 3.5 Flash';

    test('streaming output with footer scrolled offscreen does NOT flip to idle', () => {
      const session = makeSession('agy');
      const started = ingestAgentDetectionFromFilteredOutput(session, AGY_WORKING, 1000);
      expect(started.agentTuiState).toBe('running');

      // Push the working footer out of the 40-line viewport with streamed
      // output that matches no rule (detection becomes 'unknown'). Ingest may
      // re-publish stable 'running' refreshes — it must NEVER publish idle.
      let lastResult = null;
      for (let i = 0; i < 10; i += 1) {
        const chunk = Array.from({ length: 6 }, (_, j) => `diff line ${i * 6 + j}`).join('\n');
        lastResult = ingestAgentDetectionFromFilteredOutput(session, chunk, 2000 + i * 1000);
        expectNotIdle(lastResult);
        expect(lastResult.agentTuiState).toBe('running');
      }

      // Well past the old 2500ms window — but output kept flowing, so no idle.
      const tick = tickAgentDetection(session, 11500);
      expectNotIdle(tick);
      expect(tick.agentTuiState).toBe('running');
      expect(session.agentTuiState).toBe('running');
    });

    test('true silence (zero output) still flips running -> idle after the quiescence window', () => {
      const session = makeSession('agy');
      ingestAgentDetectionFromFilteredOutput(session, AGY_WORKING, 1000);
      expect(session.agentTuiState).toBe('running');

      const withinWindow = tickAgentDetection(session, 1000 + DEFAULT_AGENT_QUIESCENCE_MS - 1);
      expectNotIdle(withinWindow);
      expect(withinWindow.agentTuiState).toBe('running');

      const afterWindow = tickAgentDetection(session, 1000 + DEFAULT_AGENT_QUIESCENCE_MS + 1);
      expect(afterWindow.published).not.toBeNull();
      expect(afterWindow.published.state).toBe('idle');
      expect(afterWindow.agentTuiState).toBe('idle');
    });

    test('default quiescence window is 4000ms and configurable per session', () => {
      expect(DEFAULT_AGENT_QUIESCENCE_MS).toBe(4000);

      const session = makeSession('agy', { detectionQuiescenceMs: 1000 });
      ingestAgentDetectionFromFilteredOutput(session, AGY_WORKING, 1000);
      expect(session.agentTuiState).toBe('running');

      const tooEarly = tickAgentDetection(session, 1999);
      expectNotIdle(tooEarly);

      const due = tickAgentDetection(session, 2001);
      expect(due.published).not.toBeNull();
      expect(due.published.state).toBe('idle');
    });

    test('any output chunk refreshes the activity clock even without rule hits', () => {
      const session = makeSession('agy');
      notifyUserInput(session, 1000);
      expect(session.agentTuiState).toBe('running');

      // Output that matches no manifest rule still counts as activity.
      ingestAgentDetectionFromFilteredOutput(session, 'partial token stream', 4500);
      ingestAgentDetectionFromFilteredOutput(session, 'more tokens', 8000);

      const tick = tickAgentDetection(session, 11000);
      expectNotIdle(tick);
      expect(tick.agentTuiState).toBe('running');

      // 4001ms after the LAST chunk (t=8000) → true silence → idle.
      const silent = tickAgentDetection(session, 12001);
      expect(silent.published).not.toBeNull();
      expect(silent.published.state).toBe('idle');
    });
  });

  describe('W5 — termsize-aware viewport/buffer', () => {
    test('tall terminal (60 rows): footer at bottom-55 stays inside the detection viewport', () => {
      // kimi approval panels use region whole_recent; with the default 40-line
      // viewport a panel 55 lines above the buffer end is invisible.
      const filler = Array.from({ length: 50 }, (_, i) => `streamed line ${i}`);
      const chunk = [
        'run this command?',
        '↵ confirm',
        ' choose',
        'approve   reject',
        ...filler,
      ].join('\n');

      const small = makeSession('kimi'); // no termsize → 40-line viewport
      const smallResult = ingestAgentDetectionFromFilteredOutput(small, chunk, 1000);
      expect(smallResult.published).toBeNull(); // unknown → sticky, NOT idle
      expect(smallResult.agentTuiState).toBeNull();

      const tall = makeSession('kimi', { termsize: { cols: 120, rows: 60 } });
      const tallResult = ingestAgentDetectionFromFilteredOutput(tall, chunk, 1000);
      expect(tallResult.published).not.toBeNull();
      expect(tallResult.agentTuiState).toBe('blocked');
    });

    test('termsize-derived buffer no longer truncates a full redraw to 8KB', () => {
      const filler = 'x'.repeat(20000);
      const chunk = `${filler}\nrun this command?\n↵ confirm\n choose\napprove   reject`;

      const plain = makeSession('kimi');
      ingestAgentDetectionFromFilteredOutput(plain, chunk, 1000);
      expect(plain.detectionBuffer.length).toBe(8192);

      const wide = makeSession('kimi', { termsize: { cols: 200, rows: 60 } });
      const result = ingestAgentDetectionFromFilteredOutput(wide, chunk, 1000);
      // 200*60*2 = 24000 > chunk length → full frame retained.
      expect(wide.detectionBuffer.length).toBe(chunk.length);
      expect(result.agentTuiState).toBe('blocked');
    });

    test('explicit session overrides win over termsize-derived sizing', () => {
      const session = makeSession('kimi', {
        termsize: { cols: 200, rows: 60 },
        detectionBufferChars: 9000,
        detectionViewportLines: 45,
      });
      const chunk = `${'y'.repeat(20000)}\nrun this command?\n↵ confirm\n choose\napprove   reject`;
      ingestAgentDetectionFromFilteredOutput(session, chunk, 1000);
      expect(session.detectionBuffer.length).toBe(9000);
    });
  });

  describe('DONE-EVIDENCE-01 — two-stage quiescence + tool-active veto', () => {
    const AGY_WORKING = 'writing a story…\n\nesc to cancel\naccept-edits · Gemini 3.5 Flash';

    test('stage 1 idle carries reason quiescence; stage 2 upgrades to quiescence-confirmed', () => {
      const session = makeSession('agy');
      ingestAgentDetectionFromFilteredOutput(session, AGY_WORKING, 1000);
      expect(session.agentTuiState).toBe('running');

      const stage1 = tickAgentDetection(session, 1000 + DEFAULT_AGENT_QUIESCENCE_MS + 1);
      expect(stage1.published).not.toBeNull();
      expect(stage1.published.state).toBe('idle');
      expect(stage1.published.reason).toBe('quiescence');
      expect(session._lastIdleReason).toBe('quiescence');

      // Same state, still silent past the confirm window → reason upgrade.
      const stage2 = tickAgentDetection(session, 1000 + 12001);
      expect(stage2.published).not.toBeNull();
      expect(stage2.published.state).toBe('idle');
      expect(stage2.published.reason).toBe('quiescence-confirmed');
      expect(session._lastIdleReason).toBe('quiescence-confirmed');
      expect(session.agentTuiStateReason).toBe('quiescence-confirmed');
    });

    test('silence already past the confirm window flips straight to quiescence-confirmed', () => {
      const session = makeSession('agy');
      ingestAgentDetectionFromFilteredOutput(session, AGY_WORKING, 1000);
      expect(session.agentTuiState).toBe('running');

      const late = tickAgentDetection(session, 1000 + 13000);
      expect(late.published).not.toBeNull();
      expect(late.published.state).toBe('idle');
      expect(late.published.reason).toBe('quiescence-confirmed');
    });

    test('active hook tool vetoes quiescence even past the confirm window', () => {
      const session = makeSession('kimi', {
        hookToolActive: true,
        hookToolActiveAt: 1000,
      });
      notifyUserInput(session, 1000);
      expect(session.agentTuiState).toBe('running');

      const tick = tickAgentDetection(session, 1000 + 60000);
      expectNotIdle(tick);
      expect(session.agentTuiState).toBe('running');
    });

    test('tool-active veto expires after its safety cap', () => {
      const session = makeSession('kimi', {
        hookToolActive: true,
        hookToolActiveAt: 1000,
      });
      notifyUserInput(session, 1000);
      expect(session.agentTuiState).toBe('running');

      const beyondCap = tickAgentDetection(session, 1000 + 31 * 60 * 1000);
      expect(beyondCap.published).not.toBeNull();
      expect(beyondCap.published.state).toBe('idle');
      expect(beyondCap.published.reason).toBe('quiescence-confirmed');
    });

    test('manifest idle with a visible prompt is tagged prompt-visible', () => {
      const session = makeSession('kimi');
      notifyUserInput(session, 1000);
      expect(session.agentTuiState).toBe('running');

      // First prompt-visible idle is held by the anti-flap dwell…
      const held = ingestAgentDetectionFromFilteredOutput(session, 'kimi> ', 2000);
      expect(held.published).toBeNull();
      expect(session.agentTuiState).toBe('running');

      // …and publishes once the candidate persists past the dwell window
      const res = ingestAgentDetectionFromFilteredOutput(session, 'kimi> ', 3600);
      expect(res.published).not.toBeNull();
      expect(res.published.state).toBe('idle');
      expect(res.published.reason).toBe('prompt-visible');
      expect(session._lastIdleReason).toBe('prompt-visible');
    });

    test('dead PTY idle is tagged pty-dead', () => {
      const session = makeSession('kimi', { pty: null, ptyPid: null });
      session.agentTuiState = 'running';
      const res = tickAgentDetection(session, 5000);
      expect(res.published).not.toBeNull();
      expect(res.published.state).toBe('idle');
      expect(res.published.reason).toBe('pty-dead');
    });
  });
});
