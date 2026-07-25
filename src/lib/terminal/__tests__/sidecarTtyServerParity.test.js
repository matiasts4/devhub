/**
 * TEST-P2 item 5 — sidecar↔ttyServer detection parity.
 *
 * Promised in openspec/changes/tui-status-herdr-parity/design.md (Testing
 * Strategy row: "Integration | sidecar vs ttyServer same fixture | Shared test
 * vectors file") but never added until now.
 *
 * Both runtimes share the SAME detection engine, but through different module
 * instances:
 *   - ttyServer (web/dev, ESM) imports src/lib/terminal/sessionAgentDetector.js
 *   - the desktop sidecar (CJS) consumes the esbuild bundle
 *     sidecar-backend/bundled/agentDetection.cjs (built from the same source)
 *
 * This suite feeds identical fixtures through BOTH module instances and asserts
 * they produce byte-identical detection results — proving the bundle stays in
 * sync with the source after every `npm run build:sidecar-detection` rebuild,
 * and that both runtimes classify every agent screen the same way.
 */
const path = require('path');
const fs = require('fs');

// ttyServer path — ESM source (Jest's babel transform makes it require-able).
const esm = require('../sessionAgentDetector.js');
// Sidecar path — the prebuilt CJS bundle.
const bundle = require('../../../../sidecar-backend/bundled/agentDetection.cjs');

const FIXTURE_DIR = path.resolve(__dirname, '../../../../tests/fixtures/agent-screens');

function readFixture(name) {
  return fs.readFileSync(path.join(FIXTURE_DIR, name), 'utf8');
}

function makeSession(impl, agentType) {
  return impl.ensureAgentDetectionSession({
    agentType,
    title: '',
    agentTuiState: null,
    agentTuiStateAt: null,
    // Keep a live fake PTY so tick-based idle forcing never kicks in.
    pty: { pid: 4321 },
    ptyPid: 4321,
  });
}

function runDetection(impl, agentType, chunk) {
  const session = makeSession(impl, agentType);
  const result = impl.ingestAgentDetectionFromFilteredOutput(session, chunk, 1000);
  return {
    agentTuiState: result.agentTuiState,
    published: result.published ? result.published.state : null,
  };
}

// Shared test vectors: [label, agentType, inputChunk, expectedState].
// Fixture-file vectors exercise the on-disk agent screens; the inline raw-byte
// vectors exercise the W6 CR-collapse path (inlined so git CRLF normalization
// cannot silently rewrite the \r bytes).
const VECTORS = [
  ['agy working footer', 'agy', readFixture('antigravity-working-footer.txt'), 'running'],
  ['agy idle footer', 'agy', readFixture('antigravity-idle-footer.txt'), 'idle'],
  ['agy blocked permission', 'agy', readFixture('antigravity-blocked-permission.txt'), 'blocked'],
  ['agy working (spanish)', 'agy', readFixture('antigravity-working-spanish.txt'), 'running'],
  ['kimi blocked approval', 'kimi', readFixture('kimi-blocked-approval.txt'), 'blocked'],
  ['kimi idle prompt', 'kimi', readFixture('kimi-idle-prompt.txt'), 'idle'],
  ['kimi working footer', 'kimi', readFixture('kimi-working-footer.txt'), 'running'],
  ['grok idle footer', 'grok', readFixture('grok-idle-footer.txt'), 'idle'],
  ['grok spinner stop (subagent wait)', 'grok', readFixture('grok-spinner-stop.txt'), 'running'],
  ['qodercli idle prompt', 'qodercli', readFixture('qodercli-idle-prompt.txt'), 'idle'],
  ['qodercli working footer', 'qodercli', readFixture('qodercli-working-footer.txt'), 'running'],
  [
    'qodercli blocked permission',
    'qodercli',
    readFixture('qodercli-blocked-permission.txt'),
    'blocked',
  ],
  // W6 — CR-overwritten spinner + footer (raw \r bytes).
  [
    'agy CR-overwritten braille spinner (raw \\r)',
    'agy',
    '\x1b[1mWriting response...\x1b[0m\r\n\r\n' +
      '\x1b[2K\r⠋ Gathering context\x1b[2K\r⠇ Writing\r\n' +
      '\x1b[2mesc to cancel\x1b[0m\r\n' +
      'accept-edits · Gemini 3.5 Flash\r\n',
    'running',
  ],
  // W6 — CR-overwritten anchored idle prompt (raw \r bytes).
  [
    'agy CR-overwritten anchored idle prompt (raw \\r)',
    'agy',
    'Task completed successfully.\r\n\r\n' + '\x1b[2K\r⠋ Thinking\x1b[2K\rantigravity> \r\n',
    'idle',
  ],
  // W6 — kimi CR-overwritten moon spinner (raw \r bytes).
  ['kimi CR-overwritten moon spinner (raw \\r)', 'kimi', '\x1b[2K\r🌕\x1b[2K\r🌖\r\n', 'running'],
];

describe('sidecar↔ttyServer detection parity (TEST-P2 item 5)', () => {
  test.each(VECTORS)(
    '%s: CJS bundle matches ESM source and expected state',
    (label, agentType, chunk, expected) => {
      const esmResult = runDetection(esm, agentType, chunk);
      const bundleResult = runDetection(bundle, agentType, chunk);

      // Parity: both module instances must agree exactly.
      expect(bundleResult).toEqual(esmResult);
      // Correctness: both must classify the screen to the expected state.
      expect(esmResult.agentTuiState).toBe(expected);
      expect(esmResult.published).toBe(expected);
    }
  );

  test('bundle and source agree across a stateful running -> idle sequence', () => {
    // Full-screen redraws (W6-style \x1b[2K\r line clears) so the idle frame
    // genuinely overwrites the running footer in the accumulated buffer — the
    // same chunks proven to transition in sessionAgentDetector.test.js.
    const runningChunk =
      'Writing response...\r\n\r\n' +
      '\x1b[2K\r⠋ Gathering context\x1b[2K\r⠇ Writing\r\n' +
      'esc to cancel\r\n' +
      'accept-edits · Gemini 3.5 Flash\r\n';
    const idleChunk =
      '\x1b[2K\rHere is the story you asked for.\r\n' +
      'It has a few lines of wrapped text.\r\n' +
      'And one more concluding line.\r\n' +
      '\r\n' +
      '\x1b[2K\r? for shortcuts\r\n' +
      'accept-edits · Gemini 3.5 Flash\r\n';

    const traces = [esm, bundle].map((impl) => {
      const session = makeSession(impl, 'agy');
      const first = impl.ingestAgentDetectionFromFilteredOutput(session, runningChunk, 1000);
      const second = impl.ingestAgentDetectionFromFilteredOutput(session, idleChunk, 2000);
      return {
        afterRunning: first.agentTuiState,
        afterIdle: second.agentTuiState,
        publishedIdle: second.published ? second.published.state : null,
        finalAt: session.agentTuiStateAt,
      };
    });

    const [esmTrace, bundleTrace] = traces;
    // Both runtimes walk the same running -> idle path.
    expect(esmTrace.afterRunning).toBe('running');
    expect(esmTrace.afterIdle).toBe('idle');
    expect(esmTrace.publishedIdle).toBe('idle');
    // Parity: the CJS bundle reproduces the exact same stateful trace.
    expect(bundleTrace).toEqual(esmTrace);
  });
});
