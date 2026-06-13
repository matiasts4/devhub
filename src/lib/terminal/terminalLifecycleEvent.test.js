const {
  TERMINAL_LIFECYCLE_EVENTS,
  isTerminalLifecycleEvent,
  buildTerminalLifecycleEvent,
} = require('./terminalLifecycleEvent');

describe('terminalLifecycleEvent (A.0 schema)', () => {
  test('canonical event list is frozen and includes the headline events', () => {
    expect(Object.isFrozen(TERMINAL_LIFECYCLE_EVENTS)).toBe(true);
    expect(TERMINAL_LIFECYCLE_EVENTS).toEqual(
      expect.arrayContaining(['boot', 'dispose', 'webgl-release', 'native-sync', 'fit-skip'])
    );
  });

  test('isTerminalLifecycleEvent recognizes canonical names only', () => {
    expect(isTerminalLifecycleEvent('boot')).toBe(true);
    expect(isTerminalLifecycleEvent('dispose')).toBe(true);
    expect(isTerminalLifecycleEvent('not-a-real-event')).toBe(false);
  });

  test('builds a fully-normalized record with stable key shape', () => {
    const evt = buildTerminalLifecycleEvent({
      event: 'boot',
      panelId: 'panel-1',
      renderer: 'xterm-webgl',
      isVisible: true,
      cols: 80,
      rows: 24,
      ts: 1234,
    });

    expect(evt).toEqual({
      ts: 1234,
      panelId: 'panel-1',
      surfaceId: 'panel-1',
      sessionId: 'panel-1',
      renderer: 'xterm-webgl',
      event: 'boot',
      reason: null,
      isVisible: true,
      refCount: null,
      cols: 80,
      rows: 24,
    });
  });

  test('surfaceId and sessionId default to panelId (A.1 id alignment)', () => {
    const evt = buildTerminalLifecycleEvent({ event: 'dispose', panelId: 'p9' });
    expect(evt.surfaceId).toBe('p9');
    expect(evt.sessionId).toBe('p9');
  });

  test('explicit surfaceId/sessionId override the panelId default', () => {
    const evt = buildTerminalLifecycleEvent({
      event: 'portal-activate',
      panelId: 'p1',
      surfaceId: 's1',
      sessionId: 'sess1',
    });
    expect(evt.surfaceId).toBe('s1');
    expect(evt.sessionId).toBe('sess1');
  });

  test('missing fields normalize to null, never undefined', () => {
    const evt = buildTerminalLifecycleEvent({ event: 'native-sync' });
    expect(evt.panelId).toBeNull();
    expect(evt.renderer).toBeNull();
    expect(evt.reason).toBeNull();
    expect(evt.isVisible).toBeNull();
    expect(evt.refCount).toBeNull();
    expect(evt.cols).toBeNull();
    expect(evt.rows).toBeNull();
    expect(Object.values(evt).every((v) => v !== undefined)).toBe(true);
  });

  test('ts defaults to now when not provided', () => {
    const before = Date.now();
    const evt = buildTerminalLifecycleEvent({ event: 'boot' });
    expect(evt.ts).toBeGreaterThanOrEqual(before);
  });

  test('non-canonical event string is preserved (forward-compat) but flagged by isTerminalLifecycleEvent', () => {
    const evt = buildTerminalLifecycleEvent({ event: 'custom-event' });
    expect(evt.event).toBe('custom-event');
    expect(isTerminalLifecycleEvent(evt.event)).toBe(false);
  });
});
