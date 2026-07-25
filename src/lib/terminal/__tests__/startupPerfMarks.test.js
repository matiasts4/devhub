/**
 * @jest-environment jsdom
 */

const {
  mark,
  measure,
  markProjectReady,
  markTerminalRouteEnter,
  markFirstPanelInteractive,
  markConnectStart,
  markSessionApiOk,
  markWsConnected,
  markFirstPtyByte,
  getPerfSnapshot,
  buildStartupPerfReport,
  persistStartupPerfSnapshot,
  resetStartupPerfForTests,
  isStartupPerfEnabled,
  STARTUP_PERF_MARKS,
} = require('../startupPerfMarks');

describe('startupPerfMarks', () => {
  beforeEach(() => {
    resetStartupPerfForTests();
    window.localStorage.setItem('devhub_perf', '1');
    global.fetch = jest.fn().mockResolvedValue({ ok: true });
  });

  afterEach(() => {
    window.localStorage.removeItem('devhub_perf');
    resetStartupPerfForTests();
    delete global.fetch;
  });

  test('isStartupPerfEnabled reads localStorage flag', () => {
    expect(isStartupPerfEnabled(window.localStorage)).toBe(true);
    window.localStorage.setItem('devhub_perf', '0');
    expect(isStartupPerfEnabled(window.localStorage)).toBe(false);
  });

  test('mark + measure across project → terminal route', () => {
    markProjectReady();
    markProjectReady();
    markTerminalRouteEnter();
    markTerminalRouteEnter();
    const snap = getPerfSnapshot();
    expect(snap.marks.filter((m) => m.name === STARTUP_PERF_MARKS.PROJECT_READY)).toHaveLength(1);
    expect(
      snap.marks.filter((m) => m.name === STARTUP_PERF_MARKS.TERMINAL_ROUTE_ENTER)
    ).toHaveLength(1);
    expect(snap.measures.some((m) => m.name.includes('project-ready→terminal-route'))).toBe(true);
  });

  test('first panel interactive is once', () => {
    const info = jest.spyOn(console, 'info').mockImplementation(() => {});
    markTerminalRouteEnter();
    markFirstPanelInteractive();
    markFirstPanelInteractive();
    const marks = getPerfSnapshot().marks.filter(
      (m) => m.name === STARTUP_PERF_MARKS.FIRST_PANEL_INTERACTIVE
    );
    expect(marks).toHaveLength(1);
    expect(info).toHaveBeenCalledWith(
      '[devhub-perf]',
      'first-panel-interactive',
      expect.objectContaining({
        'terminales→panel interactive (ms)': expect.any(Number),
      })
    );
    info.mockRestore();
  });

  test('first pty byte measures from route and ws', () => {
    const info = jest.spyOn(console, 'info').mockImplementation(() => {});
    markTerminalRouteEnter();
    markFirstPanelInteractive();
    markConnectStart();
    markSessionApiOk();
    markWsConnected();
    markFirstPtyByte();
    markFirstPtyByte();
    const report = buildStartupPerfReport('test');
    expect(report.summary.terminalesToFirstByteMs).toEqual(expect.any(Number));
    expect(report.summary.wsToFirstByteMs).toEqual(expect.any(Number));
    expect(
      getPerfSnapshot().marks.filter((m) => m.name === STARTUP_PERF_MARKS.FIRST_PTY_BYTE)
    ).toHaveLength(1);
    info.mockRestore();
  });

  test('mark no-ops without throwing when Performance API missing', () => {
    const original = global.performance;

    global.performance = undefined;
    expect(() => mark('dh:test', { force: true })).not.toThrow();
    expect(() => measure('dh:m', 'a', 'b', { force: true })).not.toThrow();

    global.performance = original;
  });

  test('persistStartupPerfSnapshot POSTs report for agent review file', async () => {
    markTerminalRouteEnter();
    markFirstPanelInteractive();
    const fetchImpl = jest.fn().mockResolvedValue({ ok: true });
    const report = persistStartupPerfSnapshot('test-flush', { fetchImpl });
    expect(report.summary.terminalesToPanelInteractiveMs).toEqual(expect.any(Number));
    expect(fetchImpl).toHaveBeenCalledWith(
      '/api/terminal/perf',
      expect.objectContaining({
        method: 'POST',
        body: expect.stringContaining('"reason":"test-flush"'),
      })
    );
    expect(buildStartupPerfReport('x').meta.note).toMatch(/revisá/);
  });

  test('ws-connected persists conectando breakdown', () => {
    const info = jest.spyOn(console, 'info').mockImplementation(() => {});
    markTerminalRouteEnter();
    markFirstPanelInteractive();
    markConnectStart();
    markSessionApiOk();
    markWsConnected();
    const report = buildStartupPerfReport('ws-connected');
    expect(report.summary.interactiveToConnectedMs).toEqual(expect.any(Number));
    expect(report.summary.connectToSessionApiMs).toEqual(expect.any(Number));
    expect(report.summary.sessionApiToWsMs).toEqual(expect.any(Number));
    expect(report.meta).toEqual(
      expect.objectContaining({
        note: expect.stringMatching(/revisá/),
      })
    );
    expect(Object.prototype.hasOwnProperty.call(report.meta, 'likelyWarm')).toBe(true);
    expect(info).toHaveBeenCalledWith(
      '[devhub-perf]',
      'ws-connected',
      expect.objectContaining({
        'interactive→connected (ms)': expect.any(Number),
      })
    );
    info.mockRestore();
  });

  test('repeatable transition marks store latest measure and update summary', () => {
    const {
      markWorkspaceSwitchStart,
      markWorkspaceSwitchEnd,
      markPizarraExitStart,
      markPizarraExitEnd,
    } = require('../startupPerfMarks');

    markWorkspaceSwitchStart();
    markWorkspaceSwitchEnd();

    markPizarraExitStart();
    markPizarraExitEnd();

    const report = buildStartupPerfReport('transition-test');
    expect(report.summary.workspaceSwitchMs).toEqual(expect.any(Number));
    expect(report.summary.pizarraExitMs).toEqual(expect.any(Number));
  });

  test('incrementPerfCounter tracks counts, FIFO samples, and redundant resizes', () => {
    const { incrementPerfCounter, getPerfCounters, PERF_COUNTERS } = require('../startupPerfMarks');

    incrementPerfCounter(PERF_COUNTERS.TERMINAL_REMOUNT, { panelId: 'p1' });
    incrementPerfCounter(PERF_COUNTERS.TERMINAL_RESIZE_SENT, {
      cols: 120,
      rows: 30,
      prevCols: 120,
      prevRows: 30,
      redundant: true,
    });

    const counters = getPerfCounters();
    expect(counters[PERF_COUNTERS.TERMINAL_REMOUNT].count).toBe(1);
    expect(counters[PERF_COUNTERS.TERMINAL_RESIZE_SENT].count).toBe(1);
    expect(counters[PERF_COUNTERS.TERMINAL_RESIZE_SENT_REDUNDANT].count).toBe(1);

    const report = buildStartupPerfReport('counters-test');
    expect(report.summary.terminalRemounts).toBe(1);
    expect(report.summary.terminalResizeSent).toBe(1);
    expect(report.summary.terminalResizeSentRedundant).toBe(1);
  });
});
