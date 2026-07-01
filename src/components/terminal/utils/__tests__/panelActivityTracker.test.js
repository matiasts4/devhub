jest.useFakeTimers();

const { createPanelActivityTracker } = require('../panelActivityTracker');
const { getPanelActivity, clearPanelActivity, setPanelActivity } = require('../panelActivityStore');

describe('panelActivityTracker', () => {
  afterEach(() => {
    clearPanelActivity('p1');
  });

  function makeTracker(opts = {}) {
    return createPanelActivityTracker('p1', opts);
  }

  function substantialOutput() {
    return 'Model: GPT-4\nStatus: Working on task\nGenerating response...';
  }

  function differentSubstantialOutput() {
    return 'Model: Claude-3\nStatus: Processing input\nRunning tool call...';
  }

  test('onOpen publishes idle', () => {
    const t = makeTracker();
    t.onOpen();
    expect(getPanelActivity('p1')).toBe('idle');
  });

  test('onFrame before onReady is ignored (replay suppression)', () => {
    const t = makeTracker();
    t.onOpen();
    t.onFrame('output', substantialOutput());
    expect(getPanelActivity('p1')).toBe('idle');
  });

  test('onFrame after onReady with substantial output promotes to running', () => {
    const t = makeTracker();
    t.onOpen();
    t.onReady({ reattached: false });
    t.onFrame('output', substantialOutput());
    expect(getPanelActivity('p1')).toBe('running');
  });

  test('onFrame with noise (small chunk) does not promote to running', () => {
    const t = makeTracker();
    t.onOpen();
    t.onReady({ reattached: false });
    t.onFrame('output', 'x'.repeat(10));
    expect(getPanelActivity('p1')).toBe('idle');
  });

  test('onFrame with pure ANSI cursor-control does not promote to running', () => {
    const t = makeTracker();
    t.onOpen();
    t.onReady({ reattached: false });
    t.onFrame('output', '\x1b[?25h\x1b[?25l\x1b[H\x1b[0m\r\n'.repeat(10));
    expect(getPanelActivity('p1')).toBe('idle');
  });

  test('onFrame with identical visible content (redraw) does not promote to running', () => {
    const t = makeTracker();
    t.onOpen();
    t.onReady({ reattached: false });
    t.onFrame('output', substantialOutput());
    expect(getPanelActivity('p1')).toBe('running');
    jest.advanceTimersByTime(2100);
    expect(getPanelActivity('p1')).toBe('idle');
    t.onFrame('output', substantialOutput());
    expect(getPanelActivity('p1')).toBe('idle');
  });

  test('onFrame with different visible content promotes to running', () => {
    const t = makeTracker();
    t.onOpen();
    t.onReady({ reattached: false });
    t.onFrame('output', substantialOutput());
    jest.advanceTimersByTime(2100);
    expect(getPanelActivity('p1')).toBe('idle');
    t.onFrame('output', differentSubstantialOutput());
    expect(getPanelActivity('p1')).toBe('running');
  });

  test('debounce fires after no substantial output → idle', () => {
    const t = makeTracker({ debounceMs: 2000 });
    t.onOpen();
    t.onReady({ reattached: false });
    t.onFrame('output', substantialOutput());
    expect(getPanelActivity('p1')).toBe('running');
    jest.advanceTimersByTime(2100);
    expect(getPanelActivity('p1')).toBe('idle');
  });

  test('substantial output during debounce resets the timer', () => {
    const t = makeTracker({ debounceMs: 2000 });
    t.onOpen();
    t.onReady({ reattached: false });
    t.onFrame('output', substantialOutput());
    jest.advanceTimersByTime(1500);
    t.onFrame('output', differentSubstantialOutput());
    jest.advanceTimersByTime(1500);
    expect(getPanelActivity('p1')).toBe('running');
    jest.advanceTimersByTime(600);
    expect(getPanelActivity('p1')).toBe('idle');
  });

  test('redraw frame does not reset debounce timer', () => {
    const t = makeTracker({ debounceMs: 2000 });
    t.onOpen();
    t.onReady({ reattached: false });
    t.onFrame('output', substantialOutput());
    jest.advanceTimersByTime(1500);
    t.onFrame('output', substantialOutput());
    jest.advanceTimersByTime(600);
    expect(getPanelActivity('p1')).toBe('idle');
  });

  test('onReady with reattach + recent lastActivityAgeMs seeds running', () => {
    const t = makeTracker({ debounceMs: 2000 });
    t.onOpen();
    t.onReady({ reattached: true, lastActivityAgeMs: 500 });
    expect(getPanelActivity('p1')).toBe('running');
  });

  test('onReady with reattach + stale lastActivityAgeMs does not seed running', () => {
    const t = makeTracker({ debounceMs: 2000 });
    t.onOpen();
    t.onReady({ reattached: true, lastActivityAgeMs: 5000 });
    expect(getPanelActivity('p1')).toBe('idle');
  });

  test('onReady without reattach does not seed running even with recent activity', () => {
    const t = makeTracker({ debounceMs: 2000 });
    t.onOpen();
    t.onReady({ reattached: false, lastActivityAgeMs: 100 });
    expect(getPanelActivity('p1')).toBe('idle');
  });

  test('onClose publishes idle and clears timers', () => {
    const t = makeTracker({ debounceMs: 2000 });
    t.onOpen();
    t.onReady({ reattached: false });
    t.onFrame('output', substantialOutput());
    t.onClose();
    expect(getPanelActivity('p1')).toBe('idle');
    jest.advanceTimersByTime(3000);
    expect(getPanelActivity('p1')).toBe('idle');
  });

  test('dispose stops state transitions', () => {
    const t = makeTracker({ debounceMs: 2000 });
    t.onOpen();
    t.onReady({ reattached: false });
    t.dispose();
    setPanelActivity('p1', 'idle');
    t.onFrame('output', substantialOutput());
    expect(getPanelActivity('p1')).toBe('idle');
  });

  test('raw frame type is treated like output after ready', () => {
    const t = makeTracker();
    t.onOpen();
    t.onReady({ reattached: false });
    t.onFrame('raw', substantialOutput());
    expect(getPanelActivity('p1')).toBe('running');
  });

  test('non-output frame types are ignored', () => {
    const t = makeTracker();
    t.onOpen();
    t.onReady({ reattached: false });
    t.onFrame('exit', substantialOutput());
    expect(getPanelActivity('p1')).toBe('idle');
  });
});
