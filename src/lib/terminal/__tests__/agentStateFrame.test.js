const { buildAgentStateFrame } = require('../agentStateFrame.js');

// CJS mirror — the desktop sidecar consumes the same schema via
// sidecar-backend/sessionTransport.js.
const {
  buildAgentStateFrame: buildSidecarFrame,
} = require('../../../../sidecar-backend/sessionTransport.js');

describe('buildAgentStateFrame (frame schema, N4/N5)', () => {
  test('builds the legacy base shape', () => {
    const frame = buildAgentStateFrame({ agentTuiStateAt: 1234 }, 'running');
    expect(frame).toEqual({
      type: 'agent-state',
      agentTuiState: 'running',
      at: 1234,
    });
  });

  test('includes agentType only when set (N4)', () => {
    const withType = buildAgentStateFrame({ agentType: 'agy', agentTuiStateAt: 1 }, 'idle');
    expect(withType.agentType).toBe('agy');

    const withoutType = buildAgentStateFrame({ agentType: null, agentTuiStateAt: 1 }, 'idle');
    expect(withoutType).not.toHaveProperty('agentType');
    // Legacy consumers must never see unexpected nulls.
    expect(Object.values(withoutType)).not.toContain(null);
  });

  test('includes wasCancelled only when defined (N5)', () => {
    const noInfo = buildAgentStateFrame({ agentType: 'agy', agentTuiStateAt: 1 }, 'idle');
    expect(noInfo).not.toHaveProperty('wasCancelled');

    const cancelled = buildAgentStateFrame(
      { agentType: 'agy', agentTuiStateAt: 1, _lastAgentStateEvent: { wasCancelled: true } },
      'idle'
    );
    expect(cancelled.wasCancelled).toBe(true);

    const notCancelled = buildAgentStateFrame(
      { agentType: 'agy', agentTuiStateAt: 1, _lastAgentStateEvent: { wasCancelled: false } },
      'running'
    );
    expect(notCancelled.wasCancelled).toBe(false);
  });

  test('explicit extra overrides session state (exit/reap paths clear identity first)', () => {
    const session = { agentType: null, agentTuiStateAt: null };
    const frame = buildAgentStateFrame(session, 'idle', {
      at: 999,
      agentType: 'agy',
      reason: 'agent-exit',
      wasCancelled: false,
    });
    expect(frame).toEqual({
      type: 'agent-state',
      agentTuiState: 'idle',
      at: 999,
      agentType: 'agy',
      wasCancelled: false,
      reason: 'agent-exit',
    });
  });

  test('includes reason only for terminal frames', () => {
    const plain = buildAgentStateFrame({ agentType: 'kimi', agentTuiStateAt: 1 }, 'idle');
    expect(plain).not.toHaveProperty('reason');

    const exit = buildAgentStateFrame({ agentType: 'kimi', agentTuiStateAt: 1 }, 'idle', {
      reason: 'exit',
    });
    expect(exit.reason).toBe('exit');
  });

  test('returns null without a state (callers skip emission)', () => {
    expect(buildAgentStateFrame({ agentType: 'agy' }, null)).toBeNull();
    expect(buildAgentStateFrame(null, '')).toBeNull();
  });

  test('falls back to Date.now() when no timestamp is available', () => {
    const before = Date.now();
    const frame = buildAgentStateFrame({}, 'idle');
    const after = Date.now();
    expect(frame.at).toBeGreaterThanOrEqual(before);
    expect(frame.at).toBeLessThanOrEqual(after);
  });

  test('sidecar CJS mirror produces the identical schema', () => {
    const session = {
      agentType: 'agy',
      agentTuiStateAt: 42,
      _lastAgentStateEvent: { wasCancelled: true },
    };
    const esm = buildAgentStateFrame(session, 'blocked', { reason: 'exit' });
    const cjs = buildSidecarFrame(session, 'blocked', { reason: 'exit' });
    expect(cjs).toEqual(esm);
  });
});
