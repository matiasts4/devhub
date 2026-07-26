/**
 * Guard tests for useTerminalOutputQueue — backlog coalescing and DEC 2026 sync output.
 */

const { installDom } = require('@/test-support/domHarness');
const { renderHook, act } = require('@testing-library/react');

const {
  TERMINAL_SYNC_OUTPUT_START_SEQ,
  TERMINAL_SYNC_OUTPUT_END_SEQ,
  TERMINAL_OUTPUT_MAX_BYTES_PER_FRAME,
  TERMINAL_OUTPUT_BACKLOG_THRESHOLD,
} = require('@/components/terminal/TerminalTTY.helpers');

const useTerminalOutputQueue = require('../useTerminalOutputQueue').default;
const { createOutputRefsBag } = require('../useTerminalOutputQueue');

function createTestRefs() {
  const outputRefs = createOutputRefsBag();
  const lifecycleRefs = { current: { isDisposingRef: { current: false } } };
  const rendererRefs = { current: { termRef: { current: { write: jest.fn() } } } };
  return { outputRefs, lifecycleRefs, rendererRefs };
}

describe('useTerminalOutputQueue', () => {
  beforeAll(() => {
    installDom();
  });

  beforeEach(() => {
    jest.useFakeTimers();
    let rafId = 0;
    global.requestAnimationFrame = (cb) => {
      rafId += 1;
      const id = rafId;
      setTimeout(() => cb(performance.now()), 0);
      return id;
    };
    global.cancelAnimationFrame = (id) => clearTimeout(id);
  });

  afterEach(() => {
    jest.useRealTimers();
    jest.restoreAllMocks();
  });

  it('coalesces queued chunks and writes on flush', () => {
    const writes = [];
    const { outputRefs, lifecycleRefs, rendererRefs } = createTestRefs();

    const { result } = renderHook(() =>
      useTerminalOutputQueue({
        outputRefs,
        lifecycleRefs,
        rendererRefs,
        panelId: 'panel-1',
        onFlushWriteRef: { current: (combined) => writes.push(combined) },
      })
    );

    act(() => {
      result.current.enqueueOutput('hello ');
      result.current.enqueueOutput('world');
    });

    act(() => {
      jest.runOnlyPendingTimers();
    });

    expect(writes).toEqual(['hello world']);
    expect(outputRefs.current.terminalOutputQueueRef.current).toEqual([]);
  });

  it('drops middle of backlog when pending bytes exceed threshold', () => {
    const writes = [];
    const { outputRefs, lifecycleRefs, rendererRefs } = createTestRefs();
    const huge = 'x'.repeat(TERMINAL_OUTPUT_BACKLOG_THRESHOLD + 1000);

    const { result } = renderHook(() =>
      useTerminalOutputQueue({
        outputRefs,
        lifecycleRefs,
        rendererRefs,
        panelId: 'panel-1',
        onFlushWriteRef: { current: (combined) => writes.push(combined) },
      })
    );

    act(() => {
      result.current.enqueueOutput(huge);
    });

    act(() => {
      jest.runOnlyPendingTimers();
    });

    expect(writes).toHaveLength(1);
    expect(writes[0].length).toBeLessThanOrEqual(TERMINAL_OUTPUT_MAX_BYTES_PER_FRAME);
    expect(writes[0]).toBe(huge.slice(-TERMINAL_OUTPUT_MAX_BYTES_PER_FRAME));
  });

  it('buffers output between DEC 2026 start and end sequences', () => {
    const writes = [];
    const { outputRefs, lifecycleRefs, rendererRefs } = createTestRefs();
    const start = TERMINAL_SYNC_OUTPUT_START_SEQ;
    const end = TERMINAL_SYNC_OUTPUT_END_SEQ;

    const { result } = renderHook(() =>
      useTerminalOutputQueue({
        outputRefs,
        lifecycleRefs,
        rendererRefs,
        panelId: 'panel-1',
        onFlushWriteRef: { current: (combined) => writes.push(combined) },
      })
    );

    act(() => {
      result.current.enqueueOutput(`before${start}inside`);
    });

    act(() => {
      jest.runOnlyPendingTimers();
    });

    expect(writes).toEqual(['before']);
    expect(outputRefs.current.syncOutputActiveRef.current).toBe(true);
    expect(outputRefs.current.syncOutputBufferRef.current).toBe(`${start}inside`);

    act(() => {
      result.current.enqueueOutput(`more${end}after`);
    });

    act(() => {
      jest.runOnlyPendingTimers();
    });

    expect(writes[1]).toBe(`${start}insidemore${end}after`);
    expect(outputRefs.current.syncOutputActiveRef.current).toBe(false);
    expect(outputRefs.current.syncOutputBufferRef.current).toBe('');
  });

  it('clears queue and sync state on clearOutputQueue', () => {
    const { outputRefs, lifecycleRefs, rendererRefs } = createTestRefs();
    outputRefs.current.terminalOutputQueueRef.current = ['pending'];
    outputRefs.current.syncOutputActiveRef.current = true;
    outputRefs.current.syncOutputBufferRef.current = 'buf';

    const { result } = renderHook(() =>
      useTerminalOutputQueue({
        outputRefs,
        lifecycleRefs,
        rendererRefs,
        panelId: 'panel-1',
        onFlushWriteRef: { current: jest.fn() },
      })
    );

    act(() => {
      result.current.clearOutputQueue();
    });

    expect(outputRefs.current.terminalOutputQueueRef.current).toEqual([]);
    expect(outputRefs.current.syncOutputActiveRef.current).toBe(false);
    expect(outputRefs.current.syncOutputBufferRef.current).toBe('');
  });
});
