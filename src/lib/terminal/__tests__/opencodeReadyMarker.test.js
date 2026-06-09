const {
  buildSwarmTmuxSessionName,
  resolveViewportReadyMarkerPath,
} = require('../viewportReadyMarker.js');
const {
  detectOpenCodeTuiReady,
  resolveOpencodeReadyMarkerPath,
} = require('../opencodeReadyMarker.js');
const { writeOpencodeReadyMarker } = require('../opencodeReadyMarker.node.js');

describe('opencodeReadyMarker', () => {
  test('resolveOpencodeReadyMarkerPath maps tmux session to /tmp marker', () => {
    expect(resolveOpencodeReadyMarkerPath('devhub-swarm-launch-1-coder')).toBe(
      '/tmp/devhub-opencode-ready-devhub-swarm-launch-1-coder'
    );
  });

  test('detectOpenCodeTuiReady matches interactive footer hints', () => {
    expect(detectOpenCodeTuiReady('ctrl+p commands')).toBe(true);
    expect(detectOpenCodeTuiReady('esc interrupt')).toBe(true);
    expect(detectOpenCodeTuiReady('booting opencode')).toBe(false);
  });

  test('writeOpencodeReadyMarker writes JSON payload', () => {
    const writeFileSync = jest.fn();
    const markerPath = writeOpencodeReadyMarker(
      'devhub-swarm-launch-1-coder',
      { opencodeSessionId: 'ses_abc', reason: 'test' },
      { fsImpl: { writeFileSync } }
    );

    expect(markerPath).toBe('/tmp/devhub-opencode-ready-devhub-swarm-launch-1-coder');
    expect(writeFileSync).toHaveBeenCalledTimes(1);
    const payload = JSON.parse(writeFileSync.mock.calls[0][1]);
    expect(payload.opencodeSessionId).toBe('ses_abc');
    expect(payload.reason).toBe('test');
    expect(payload.tmuxSession).toBe('devhub-swarm-launch-1-coder');
  });

  test('shares tmux naming with viewport markers', () => {
    const tmux = buildSwarmTmuxSessionName('launch-1', 'coder');
    expect(resolveOpencodeReadyMarkerPath(tmux)).toBe(
      resolveViewportReadyMarkerPath(tmux).replace('viewport', 'opencode')
    );
  });
});
