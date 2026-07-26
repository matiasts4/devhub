/**
 * Phase 0 (terminal-load-performance / sin-parpadeo): the `terminal-repaint-nudge`
 * perf counter must fire on every executed nudge so the "zero nudges on a clean
 * reveal" SLO is measurable in data/logs/startup-perf/latest.json.
 */

jest.mock('@/lib/terminal/startupPerfMarks', () => {
  const actual = jest.requireActual('@/lib/terminal/startupPerfMarks');
  return {
    ...actual,
    incrementPerfCounter: jest.fn(),
  };
});

import { incrementPerfCounter, PERF_COUNTERS } from '@/lib/terminal/startupPerfMarks';
import {
  forceTerminalViewportRepaint,
  nudgeTerminalViewportRepaint,
} from '@/components/terminal/TerminalTTY.helpers';

function makeTerm({ cols = 80, rows = 24 } = {}) {
  return {
    cols,
    rows,
    resize: jest.fn(),
    refresh: jest.fn(),
    _core: {
      _renderService: {
        _renderer: { value: {} },
        dimensions: { css: { cell: { width: 10, height: 20 } } },
        clear: jest.fn(),
      },
    },
  };
}

describe('terminal-repaint-nudge counter', () => {
  beforeEach(() => {
    incrementPerfCounter.mockClear();
  });

  test('nudgeTerminalViewportRepaint emits kind:nudge with dims after a real nudge', () => {
    const term = makeTerm();
    expect(nudgeTerminalViewportRepaint(term)).toBe(true);
    expect(incrementPerfCounter).toHaveBeenCalledTimes(1);
    expect(incrementPerfCounter).toHaveBeenCalledWith(PERF_COUNTERS.TERMINAL_REPAINT_NUDGE, {
      cols: 80,
      rows: 24,
      kind: 'nudge',
    });
  });

  test('forceTerminalViewportRepaint clears first and emits kind:force', () => {
    const term = makeTerm();
    expect(forceTerminalViewportRepaint(term)).toBe(true);
    expect(term._core._renderService.clear).toHaveBeenCalled();
    expect(incrementPerfCounter).toHaveBeenCalledTimes(1);
    expect(incrementPerfCounter).toHaveBeenCalledWith(PERF_COUNTERS.TERMINAL_REPAINT_NUDGE, {
      cols: 80,
      rows: 24,
      kind: 'force',
    });
  });

  test('emits nothing when the nudge is skipped (bad dims / renderer not ready)', () => {
    const zeroTerm = makeTerm({ cols: 0, rows: 0 });
    expect(nudgeTerminalViewportRepaint(zeroTerm)).toBe(false);

    const notReady = makeTerm();
    notReady._core._renderService._renderer.value = undefined;
    expect(nudgeTerminalViewportRepaint(notReady)).toBe(false);

    expect(incrementPerfCounter).not.toHaveBeenCalled();
  });
});
