const {
  buildSwarmTmuxSessionName,
  resolveViewportReadyMarkerPath,
  writeViewportReadyMarker,
} = require('../viewportReadyMarker.js');

describe('viewportReadyMarker', () => {
  test('buildSwarmTmuxSessionName composes launch and role', () => {
    expect(buildSwarmTmuxSessionName('launch-1', 'coder')).toBe('devhub-swarm-launch-1-coder');
    expect(buildSwarmTmuxSessionName('', 'coder')).toBeNull();
  });

  test('resolveViewportReadyMarkerPath maps tmux session to /tmp marker', () => {
    expect(resolveViewportReadyMarkerPath('devhub-swarm-launch-1-coder')).toBe(
      '/tmp/devhub-viewport-ready-devhub-swarm-launch-1-coder'
    );
  });

  test('writeViewportReadyMarker writes JSON payload', () => {
    const writeFileSync = jest.fn();
    const markerPath = writeViewportReadyMarker(
      'devhub-swarm-launch-1-coder',
      { cols: 132, rows: 38, sessionId: 'p1' },
      { fsImpl: { writeFileSync } }
    );

    expect(markerPath).toBe('/tmp/devhub-viewport-ready-devhub-swarm-launch-1-coder');
    expect(writeFileSync).toHaveBeenCalledTimes(1);
    const payload = JSON.parse(writeFileSync.mock.calls[0][1]);
    expect(payload.cols).toBe(132);
    expect(payload.rows).toBe(38);
    expect(payload.sessionId).toBe('p1');
  });
});
