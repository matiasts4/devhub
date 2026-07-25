/**
 * @jest-environment jsdom
 *
 * terminal-load-performance PR6 — TUI scroll integrity:
 * resize dimension guard + telemetry wiring, and viewport preservation on reveal.
 */

const {
  fitTerminalViewport,
  nudgeTerminalPtyResize,
  restoreTerminalViewportAfterReveal,
} = require('../TerminalTTY.helpers');
const {
  getPerfCounters,
  PERF_COUNTERS,
  resetStartupPerfForTests,
} = require('@/lib/terminal/startupPerfMarks');

function makeViewport({ cols = 80, rows = 24 } = {}) {
  const container = {
    getBoundingClientRect: () => ({ width: cols * 10, height: rows * 20 }),
  };
  const fitAddon = { fit: jest.fn() };
  const term = {
    cols,
    rows,
    resize: jest.fn(function (c, r) {
      this.cols = c;
      this.rows = r;
    }),
    refresh: jest.fn(),
    _core: {
      _renderService: {
        _renderer: { value: {} },
        dimensions: { css: { cell: { width: 10, height: 20 } } },
        clear: jest.fn(),
      },
    },
  };
  const socket = { readyState: 1, send: jest.fn() };
  return { container, fitAddon, term, socket };
}

function makeScrollTerm({ baseY = 50, viewportY = 0, length = 100 } = {}) {
  return {
    rows: 24,
    scrollToLine: jest.fn(),
    buffer: { active: { type: 'normal', baseY, viewportY, length } },
  };
}

describe('terminal scroll integrity (PR6)', () => {
  beforeEach(() => {
    resetStartupPerfForTests();
    window.localStorage.setItem('devhub_perf', '1');
  });

  afterEach(() => {
    window.localStorage.removeItem('devhub_perf');
    resetStartupPerfForTests();
  });

  describe('resize dimension guard', () => {
    test('first resize of the session passes and records telemetry', () => {
      const { container, fitAddon, term, socket } = makeViewport();
      const lastPtySizeRef = { cols: 0, rows: 0 };

      expect(
        fitTerminalViewport({
          container,
          fitAddon,
          term,
          socket,
          websocketOpenState: 1,
          clearAtlas: false,
          lastPtySizeRef,
        })
      ).toBe(true);

      expect(socket.send).toHaveBeenCalledWith(
        JSON.stringify({ type: 'resize', cols: 80, rows: 24 })
      );
      expect(lastPtySizeRef).toEqual({ cols: 80, rows: 24 });

      const counters = getPerfCounters();
      expect(counters[PERF_COUNTERS.TERMINAL_RESIZE_SENT].count).toBe(1);
      expect(counters[PERF_COUNTERS.TERMINAL_RESIZE_SENT_REDUNDANT]).toBeUndefined();
      expect(counters[PERF_COUNTERS.TERMINAL_RESIZE_SENT].samples[0]).toEqual(
        expect.objectContaining({ cols: 80, rows: 24, redundant: false, source: 'fit-viewport' })
      );
    });

    test('zero-delta resize is suppressed but counted as redundant', () => {
      const { container, fitAddon, term, socket } = makeViewport();
      const lastPtySizeRef = { cols: 80, rows: 24 };

      fitTerminalViewport({
        container,
        fitAddon,
        term,
        socket,
        websocketOpenState: 1,
        clearAtlas: false,
        lastPtySizeRef,
        source: 'send-resize',
        telemetryDetail: { hidden: false, tuiActive: true },
      });

      expect(socket.send).not.toHaveBeenCalled();
      expect(lastPtySizeRef).toEqual({ cols: 80, rows: 24 });

      const counters = getPerfCounters();
      expect(counters[PERF_COUNTERS.TERMINAL_RESIZE_SENT].count).toBe(1);
      expect(counters[PERF_COUNTERS.TERMINAL_RESIZE_SENT_REDUNDANT].count).toBe(1);
      expect(counters[PERF_COUNTERS.TERMINAL_RESIZE_SENT].samples[0]).toEqual(
        expect.objectContaining({
          redundant: true,
          source: 'send-resize',
          hidden: false,
          tuiActive: true,
        })
      );
    });

    test('real window resize (cols/rows delta) still flows to the PTY', () => {
      const { container, fitAddon, term, socket } = makeViewport({ cols: 100, rows: 30 });
      term.cols = 80;
      term.rows = 24;
      const lastPtySizeRef = { cols: 80, rows: 24 };

      fitTerminalViewport({
        container,
        fitAddon,
        term,
        socket,
        websocketOpenState: 1,
        clearAtlas: false,
        lastPtySizeRef,
      });

      expect(term.resize).toHaveBeenCalledWith(100, 30);
      expect(socket.send).toHaveBeenCalledWith(
        JSON.stringify({ type: 'resize', cols: 100, rows: 30 })
      );
      expect(lastPtySizeRef).toEqual({ cols: 100, rows: 30 });
      expect(getPerfCounters()[PERF_COUNTERS.TERMINAL_RESIZE_SENT_REDUNDANT]).toBeUndefined();
    });

    test('post-reconnect resize passes after the last-sent size is reset', () => {
      const { container, fitAddon, term, socket } = makeViewport();
      const lastPtySizeRef = { cols: 80, rows: 24 };

      // useTerminalV2Session resets the last-sent size on WS (re)connect so the
      // server re-syncs dimensions — the same zero-delta resize must pass again.
      lastPtySizeRef.cols = 0;
      lastPtySizeRef.rows = 0;

      fitTerminalViewport({
        container,
        fitAddon,
        term,
        socket,
        websocketOpenState: 1,
        clearAtlas: false,
        lastPtySizeRef,
      });

      expect(socket.send).toHaveBeenCalledWith(
        JSON.stringify({ type: 'resize', cols: 80, rows: 24 })
      );
      expect(lastPtySizeRef).toEqual({ cols: 80, rows: 24 });
    });

    test('forced nudge (post-reattach redraw) always sends; unforced same-size nudge is suppressed', () => {
      const term = { cols: 80, rows: 24, resize: jest.fn() };
      const socket = { readyState: 1, send: jest.fn() };
      const lastPtySizeRef = { cols: 80, rows: 24 };

      expect(nudgeTerminalPtyResize({ term, socket, websocketOpenState: 1, lastPtySizeRef })).toBe(
        false
      );
      expect(socket.send).not.toHaveBeenCalled();

      expect(
        nudgeTerminalPtyResize({ term, socket, websocketOpenState: 1, lastPtySizeRef, force: true })
      ).toBe(true);
      expect(socket.send).toHaveBeenCalledWith(
        JSON.stringify({ type: 'resize', cols: 80, rows: 24 })
      );

      const counters = getPerfCounters();
      // Both the suppressed nudge and the forced nudge are tracked; the forced
      // one is zero-delta too, so both land in the redundant counter.
      expect(counters[PERF_COUNTERS.TERMINAL_RESIZE_SENT].count).toBe(2);
      expect(counters[PERF_COUNTERS.TERMINAL_RESIZE_SENT_REDUNDANT].count).toBe(2);
    });
  });

  describe('viewport preservation on reveal', () => {
    test('user in scrollback: viewport restored and scroll-jump counted', () => {
      const term = makeScrollTerm({ viewportY: 50 }); // reveal jumped to the bottom

      expect(
        restoreTerminalViewportAfterReveal({
          term,
          viewportYBefore: 12,
          wasNearBottom: false,
          panelId: 'p1',
        })
      ).toBe(true);

      expect(term.scrollToLine).toHaveBeenCalledWith(12);
      const counters = getPerfCounters();
      expect(counters[PERF_COUNTERS.TERMINAL_SCROLL_JUMP].count).toBe(1);
      expect(counters[PERF_COUNTERS.TERMINAL_SCROLL_JUMP].samples[0]).toEqual({
        panelId: 'p1',
        from: 50,
        to: 12,
        restored: true,
      });
    });

    test('user at the bottom stays at the bottom (no restore, no counter)', () => {
      const term = makeScrollTerm({ viewportY: 50 });

      expect(
        restoreTerminalViewportAfterReveal({
          term,
          viewportYBefore: 50,
          wasNearBottom: true,
          panelId: 'p1',
        })
      ).toBe(false);

      expect(term.scrollToLine).not.toHaveBeenCalled();
      expect(getPerfCounters()[PERF_COUNTERS.TERMINAL_SCROLL_JUMP]).toBeUndefined();
    });

    test('unchanged viewport is left alone (no counter)', () => {
      const term = makeScrollTerm({ viewportY: 12 });

      expect(
        restoreTerminalViewportAfterReveal({
          term,
          viewportYBefore: 12,
          wasNearBottom: false,
          panelId: 'p1',
        })
      ).toBe(false);

      expect(term.scrollToLine).not.toHaveBeenCalled();
      expect(getPerfCounters()[PERF_COUNTERS.TERMINAL_SCROLL_JUMP]).toBeUndefined();
    });
  });
});
