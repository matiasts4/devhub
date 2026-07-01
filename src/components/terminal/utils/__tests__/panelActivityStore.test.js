const {
  getPanelActivity,
  setPanelActivity,
  subscribePanelActivity,
  clearPanelActivity,
  getPanelActivityAgeMs,
  ACTIVITY_DEBOUNCE_MS,
  NOISE_MIN_BYTES,
  PURE_NOISE_RE,
} = require('../panelActivityStore');

describe('panelActivityStore', () => {
  afterEach(() => {
    clearPanelActivity('p1');
    clearPanelActivity('p2');
  });

  test('getPanelActivity returns null for unknown panel', () => {
    expect(getPanelActivity('unknown')).toBeNull();
  });

  test('setPanelActivity stores running and idle states', () => {
    setPanelActivity('p1', 'running');
    expect(getPanelActivity('p1')).toBe('running');
    setPanelActivity('p1', 'idle');
    expect(getPanelActivity('p1')).toBe('idle');
  });

  test('setPanelActivity notifies subscribers only on real change', () => {
    const calls = [];
    const unsub = subscribePanelActivity('p1', (s) => calls.push(s));
    setPanelActivity('p1', 'running');
    setPanelActivity('p1', 'running');
    setPanelActivity('p1', 'idle');
    expect(calls).toEqual(['running', 'idle']);
    unsub();
  });

  test('unsubscribe stops notifications', () => {
    const calls = [];
    const unsub = subscribePanelActivity('p1', (s) => calls.push(s));
    setPanelActivity('p1', 'running');
    unsub();
    setPanelActivity('p1', 'idle');
    expect(calls).toEqual(['running']);
  });

  test('clearPanelActivity removes state and notifies with null', () => {
    const calls = [];
    subscribePanelActivity('p1', (s) => calls.push(s));
    setPanelActivity('p1', 'running');
    clearPanelActivity('p1');
    expect(getPanelActivity('p1')).toBeNull();
    expect(calls[calls.length - 1]).toBeNull();
  });

  test('getPanelActivityAgeMs returns null when no substantial frame yet', () => {
    expect(getPanelActivityAgeMs('p1')).toBeNull();
  });

  test('getPanelActivityAgeMs returns ms since running was set', () => {
    setPanelActivity('p1', 'running');
    const age = getPanelActivityAgeMs('p1');
    expect(age).toBeGreaterThanOrEqual(0);
    expect(age).toBeLessThan(1000);
  });

  test('PURE_NOISE_RE matches cursor-control and whitespace only', () => {
    expect(PURE_NOISE_RE.test('\x1b[?25h')).toBe(true);
    expect(PURE_NOISE_RE.test('\x1b[?25l')).toBe(true);
    expect(PURE_NOISE_RE.test('\r\n')).toBe(true);
    expect(PURE_NOISE_RE.test('\x1b[H\x1b[0m\r\n')).toBe(true);
    expect(PURE_NOISE_RE.test('hello world this is substantial output')).toBe(false);
  });

  test('constants have expected values', () => {
    expect(ACTIVITY_DEBOUNCE_MS).toBe(2000);
    expect(NOISE_MIN_BYTES).toBe(50);
  });
});
