const {
  buildSwarmTmuxSessionName,
  resolveViewportReadyMarkerPath,
} = require('../viewportReadyMarker.js');
const {
  detectOpenCodeTuiReady,
  resolveOpencodeReadyMarkerPath,
  resolveAgentReadyMarkerPath,
} = require('../opencodeReadyMarker.js');
const {
  writeOpencodeReadyMarker,
  writeAgentReadyMarker,
} = require('../opencodeReadyMarker.node.js');

describe('opencodeReadyMarker', () => {
  test('resolveOpencodeReadyMarkerPath maps tmux session to /tmp marker', () => {
    expect(resolveOpencodeReadyMarkerPath('devhub-swarm-launch-1-coder')).toBe(
      '/tmp/devhub-opencode-ready-devhub-swarm-launch-1-coder'
    );
  });

  test('detectOpenCodeTuiReady matches interactive footer hints', () => {
    expect(detectOpenCodeTuiReady('ctrl+p commands')).toBe(true);
    expect(detectOpenCodeTuiReady('esc interrupt')).toBe(true);
    expect(
      detectOpenCodeTuiReady('⊙ 6 MCP /status    1.16.2\nMiniMax Token Plan (minimax.io)')
    ).toBe(true);
    expect(detectOpenCodeTuiReady('booting opencode')).toBe(false);
  });

  test('writeOpencodeReadyMarker writes generic and legacy markers', () => {
    const writeFileSync = jest.fn();
    const markerPath = writeOpencodeReadyMarker(
      'devhub-swarm-launch-1-coder',
      { opencodeSessionId: 'ses_abc', reason: 'test' },
      { fsImpl: { writeFileSync } }
    );

    expect(markerPath).toBe('/tmp/devhub-opencode-ready-devhub-swarm-launch-1-coder');
    expect(writeFileSync).toHaveBeenCalledTimes(2);
    const genericPath = writeFileSync.mock.calls[0][0];
    expect(genericPath).toBe('/tmp/devhub-agent-ready-opencode-devhub-swarm-launch-1-coder');
    const payload = JSON.parse(writeFileSync.mock.calls[0][1]);
    expect(payload.opencodeSessionId).toBe('ses_abc');
    expect(payload.reason).toBe('test');
    expect(payload.tmuxSession).toBe('devhub-swarm-launch-1-coder');
    expect(payload.program).toBe('opencode');

    const legacyPath = writeFileSync.mock.calls[1][0];
    expect(legacyPath).toBe('/tmp/devhub-opencode-ready-devhub-swarm-launch-1-coder');
  });

  test('shares tmux naming with viewport markers', () => {
    const tmux = buildSwarmTmuxSessionName('launch-1', 'coder');
    expect(resolveOpencodeReadyMarkerPath(tmux)).toBe(
      resolveViewportReadyMarkerPath(tmux).replace('viewport', 'opencode')
    );
  });

  test('resolveAgentReadyMarkerPath includes program id before tmux session', () => {
    expect(resolveAgentReadyMarkerPath('devhub-swarm-launch-1-coder', 'kimi')).toBe(
      '/tmp/devhub-agent-ready-kimi-devhub-swarm-launch-1-coder'
    );
    expect(resolveAgentReadyMarkerPath('devhub-swarm-launch-1-coder', 'opencode')).toBe(
      '/tmp/devhub-agent-ready-opencode-devhub-swarm-launch-1-coder'
    );
    expect(resolveAgentReadyMarkerPath('devhub-swarm-launch-1-coder')).toBe(
      '/tmp/devhub-agent-ready-opencode-devhub-swarm-launch-1-coder'
    );
  });

  test('writeAgentReadyMarker writes generic marker and legacy opencode marker', () => {
    const writeFileSync = jest.fn();
    const markerPath = writeAgentReadyMarker(
      'devhub-swarm-launch-1-coder',
      'kimi',
      { opencodeSessionId: 'ses_abc', reason: 'test' },
      { fsImpl: { writeFileSync } }
    );

    expect(markerPath).toBe('/tmp/devhub-agent-ready-kimi-devhub-swarm-launch-1-coder');
    expect(writeFileSync).toHaveBeenCalledTimes(2);
    const genericPayload = JSON.parse(writeFileSync.mock.calls[0][1]);
    expect(genericPayload.opencodeSessionId).toBe('ses_abc');
    expect(genericPayload.reason).toBe('test');
    expect(genericPayload.tmuxSession).toBe('devhub-swarm-launch-1-coder');
    expect(genericPayload.program).toBe('kimi');

    const legacyPath = writeFileSync.mock.calls[1][0];
    expect(legacyPath).toBe('/tmp/devhub-opencode-ready-devhub-swarm-launch-1-coder');
  });
});
