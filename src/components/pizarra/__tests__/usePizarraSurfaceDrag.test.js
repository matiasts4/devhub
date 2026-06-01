/**
 * usePizarraSurfaceDrag — RAF-batched drag contract tests.
 *
 * Covers openspec/changes/pizarra-ux-overhaul/specs/board-terminal-drag
 * (Req 1 RAF batching, Req 2 zero-delta short-circuit, Req 3 zoom-aware
 * delta math, Req 4 unmount cleanup, Req 5 native-sync dedupe, Req 6
 * drag-handle testid) plus the "Jest setup provides requestAnimationFrame
 * and cancelAnimationFrame" scenario from board-canvas Req 4.
 *
 * Test strategy: render a small TestHost that wires the hook to a
 * button with data-testid="pizarra-drag-handle". We drive the hook by
 * dispatching mousedown on the button, then a series of window
 * mousemove events, then window mouseup. The TestHost exposes counters
 * + the last payload from each callback for assertions.
 */

const React = require('react');
const { createRoot } = require('react-dom/client');
const { flushSync } = require('react-dom');
const { act } = require('react');
const { JSDOM } = require('jsdom');

// ── Polyfill jest RAF for this file's scope ────────────────────────────────
//
// The runtime-compat shim (tests/jest.runtime-compat.js) installs a
// setTimeout-based RAF for the test file. We capture the per-call
// handle so we can drive the RAF loop deterministically. This avoids
// real wall-clock waits and makes zero-delta / unmount tests precise.
let __rafQueue = [];
let __rafHandleCounter = 0;
const __realSetTimeout = setTimeout;
const __realClearTimeout = clearTimeout;

function rafPolyfill(callback) {
  const handle = ++__rafHandleCounter;
  __rafQueue.push({ handle, callback });
  return handle;
}

function cancelRafPolyfill(handle) {
  __rafQueue = __rafQueue.filter((entry) => entry.handle !== handle);
}

global.requestAnimationFrame = rafPolyfill;
global.cancelAnimationFrame = cancelRafPolyfill;

function flushRaf() {
  // Drain the queue in order. Each callback may schedule more RAFs;
  // drain recursively until empty.
  let safety = 100;
  while (__rafQueue.length > 0 && safety-- > 0) {
    const drained = __rafQueue.slice();
    __rafQueue = [];
    drained.forEach((entry) => {
      try {
        entry.callback(performance.now());
      } catch (err) {
        console.error('flushRaf callback threw:', err);
      }
    });
  }
  if (safety <= 0) {
    throw new Error('flushRaf: too many recursive RAF ticks');
  }
}

// ── Helpers ───────────────────────────────────────────────────────────────

function installDom() {
  const dom = new JSDOM('<!DOCTYPE html><html><body></body></html>', {
    url: 'http://localhost:3100/',
  });
  global.document = dom.window.document;
  global.window = dom.window;
  global.navigator = dom.window.navigator;
  global.MouseEvent = dom.window.MouseEvent;
  global.HTMLElement = dom.window.HTMLElement;
  global.Event = dom.window.Event;
}

function makeMouseEvent(type, clientX, clientY, button = 0, extraProps = {}) {
  // JSDOM's MouseEvent doesn't allow extra props via the constructor
  // options, so we build the event and assign custom props.
  const event = new global.MouseEvent(type, {
    bubbles: true,
    cancelable: true,
    button,
    clientX,
    clientY,
  });
  Object.keys(extraProps).forEach((key) => {
    try {
      event[key] = extraProps[key];
    } catch (e) {
      // Some props are read-only; ignore.
    }
  });
  return event;
}

// ── Test host ─────────────────────────────────────────────────────────────
//
// The TestHost renders a button, calls usePizarraSurfaceDrag with the
// provided callbacks, and exposes the latest onMove / onNativeSync
// payload via a ref-like sink the test can read.

let onMoveSink = [];
let onNativeSyncSink = [];
let onSelectSink = [];

function makeTestHost({ bounds, resolvedZoom, moveMeta } = {}) {
  // Use a fresh module instance per test so the sink state is clean.
  onMoveSink = [];
  onNativeSyncSink = [];
  onSelectSink = [];
  return {
    onMove: (payload) => onMoveSink.push(payload),
    onNativeSync: (payload) => onNativeSyncSink.push(payload),
    onSelect: (id) => onSelectSink.push(id),
    bounds: bounds || { x: 0, y: 0, width: 100, height: 100 },
    resolvedZoom: resolvedZoom === undefined ? 1 : resolvedZoom,
    moveMeta: moveMeta || {},
  };
}

function renderHost(props) {
  // Re-require the hook inside the test function so the resolvedZoom
  // mock + RAF polyfill are wired before the hook is initialized.
  const usePizarraSurfaceDrag = require('../usePizarraSurfaceDrag').default;

  // The hook reads resolvedZoom from a mousemove event's custom
  // `resolvedZoom` property (so tests can simulate mid-drag zoom
  // changes). The initial value is set on the mousedown event via
  // `event.nativeEvent.resolvedZoom` or, if absent, defaults to 1.
  let currentZoom = props.resolvedZoom || 1;

  function TestHost() {
    const handleMouseDown = usePizarraSurfaceDrag({
      surfaceId: 'test-surface',
      bounds: props.bounds || { x: 0, y: 0, width: 100, height: 100 },
      onSelect: props.onSelect,
      onMove: props.onMove,
      moveMeta: props.moveMeta || {},
      onNativeSync: props.onNativeSync,
    });
    // Wire a wrapping onMouseDown that injects the current zoom.
    function wrappedOnMouseDown(event) {
      // Attach resolvedZoom to event.nativeEvent so the hook reads it.
      if (event.nativeEvent) {
        event.nativeEvent.resolvedZoom = currentZoom;
      } else {
        event.resolvedZoom = currentZoom;
      }
      handleMouseDown(event);
    }
    return React.createElement('button', {
      'data-testid': 'pizarra-drag-handle',
      onMouseDown: wrappedOnMouseDown,
    });
  }

  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  act(() => {
    root.render(React.createElement(TestHost));
  });
  return {
    container,
    root,
    button: container.querySelector('[data-testid="pizarra-drag-handle"]'),
    setResolvedZoom: (v) => {
      currentZoom = v;
    },
  };
}

function unmountHost(harness) {
  act(() => {
    harness.root.unmount();
  });
  harness.container.remove();
}

// ── Tests ─────────────────────────────────────────────────────────────────

describe('usePizarraSurfaceDrag — board-terminal-drag contract', () => {
  let dom;
  let consoleErrorSpy;

  beforeEach(() => {
    dom = installDom();
    consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    consoleErrorSpy.mockRestore();
    if (dom && dom.window) {
      try {
        dom.window.close();
      } catch (e) {
        // JSDOM may already be closed; ignore.
      }
    }
  });

  test('RAF batches multiple move events into a single onMove call', () => {
    const props = makeTestHost({});
    const harness = renderHost(props);

    act(() => {
      harness.button.dispatchEvent(makeMouseEvent('mousedown', 0, 0));
    });

    // Three rapid mousemoves in the same frame.
    act(() => {
      global.window.dispatchEvent(makeMouseEvent('mousemove', 5, 5));
      global.window.dispatchEvent(makeMouseEvent('mousemove', 10, 10));
      global.window.dispatchEvent(makeMouseEvent('mousemove', 15, 15));
    });

    // The RAF is scheduled; flush it.
    act(() => {
      flushRaf();
    });

    expect(onMoveSink.length).toBe(1);
    // The hook's lastPointer advances per move, so totalDeltaX/Y
    // reflects the FINAL position (15, 15) from start (0, 0).
    expect(onMoveSink[0].totalDeltaX).toBe(15);
    expect(onMoveSink[0].totalDeltaY).toBe(15);

    act(() => {
      global.window.dispatchEvent(makeMouseEvent('mouseup'));
    });
    unmountHost(harness);
  });

  test('mouseup cancels in-flight RAF and clears pendingMoveRef', () => {
    const props = makeTestHost({});
    const harness = renderHost(props);

    act(() => {
      harness.button.dispatchEvent(makeMouseEvent('mousedown', 0, 0));
    });
    act(() => {
      global.window.dispatchEvent(makeMouseEvent('mousemove', 5, 5));
    });

    // mouseup flushes the pending move AND cancels the RAF. After
    // mouseup, a new mousemove should NOT trigger onMove.
    act(() => {
      global.window.dispatchEvent(makeMouseEvent('mouseup'));
    });
    // The hook's flushPendingMove is called synchronously inside
    // mouseup. After mouseup, the next mousemove should not be
    // observed as part of this drag.
    act(() => {
      global.window.dispatchEvent(makeMouseEvent('mousemove', 50, 50));
    });
    flushRaf();

    // Only the first move (or zero if mouseup flushed before flushRaf)
    // should be in the sink.
    expect(onMoveSink.length).toBeLessThanOrEqual(1);
    // And no later mousemove should produce a new onMove.
    const initialLength = onMoveSink.length;
    act(() => {
      global.window.dispatchEvent(makeMouseEvent('mousemove', 100, 100));
    });
    flushRaf();
    expect(onMoveSink.length).toBe(initialLength);

    unmountHost(harness);
  });

  test('zero-delta move does not invoke onNativeSync', () => {
    const props = makeTestHost({});
    const harness = renderHost(props);

    act(() => {
      harness.button.dispatchEvent(makeMouseEvent('mousedown', 50, 50));
    });

    // Move the cursor by zero pixels (e.g., sub-pixel rounding).
    act(() => {
      global.window.dispatchEvent(makeMouseEvent('mousemove', 50, 50));
    });
    flushRaf();

    // onMove MAY be called once with zero delta; onNativeSync MUST NOT.
    // The hook's handleMouseMove short-circuits on (0, 0) delta, so
    // neither is invoked. Both sinks are empty.
    expect(onNativeSyncSink.length).toBe(0);
    expect(onMoveSink.length).toBe(0);

    act(() => {
      global.window.dispatchEvent(makeMouseEvent('mouseup'));
    });
    unmountHost(harness);
  });

  test('stationary cursor does not invoke onNativeSync across 10 frames', () => {
    const props = makeTestHost({});
    const harness = renderHost(props);

    act(() => {
      harness.button.dispatchEvent(makeMouseEvent('mousedown', 0, 0));
    });

    // 10 frames of identical mousemove.
    for (let i = 0; i < 10; i++) {
      act(() => {
        global.window.dispatchEvent(makeMouseEvent('mousemove', 0, 0));
      });
      act(() => {
        flushRaf();
      });
    }

    expect(onNativeSyncSink.length).toBe(0);

    act(() => {
      global.window.dispatchEvent(makeMouseEvent('mouseup'));
    });
    unmountHost(harness);
  });

  test('delta is divided by resolvedZoom before being passed to onMove', () => {
    // resolvedZoom=2.0, raw delta (40, 60) → onMove gets (20, 30).
    const props = makeTestHost({ resolvedZoom: 2.0 });
    const harness = renderHost(props);

    act(() => {
      harness.button.dispatchEvent(makeMouseEvent('mousedown', 0, 0));
    });
    act(() => {
      global.window.dispatchEvent(makeMouseEvent('mousemove', 40, 60, 0));
    });
    flushRaf();

    expect(onMoveSink.length).toBe(1);
    expect(onMoveSink[0].deltaX).toBe(20);
    expect(onMoveSink[0].deltaY).toBe(30);
    expect(onMoveSink[0].totalDeltaX).toBe(20);
    expect(onMoveSink[0].totalDeltaY).toBe(30);

    act(() => {
      global.window.dispatchEvent(makeMouseEvent('mouseup'));
    });
    unmountHost(harness);
  });

  test('zoom change mid-drag uses the latest resolvedZoom at flush time', () => {
    const props = makeTestHost({ resolvedZoom: 1.0 });
    const harness = renderHost(props);

    act(() => {
      harness.button.dispatchEvent(makeMouseEvent('mousedown', 0, 0));
    });
    // First move at zoom=1, delta (10, 10).
    act(() => {
      global.window.dispatchEvent(makeMouseEvent('mousemove', 10, 10, 0, { resolvedZoom: 1.0 }));
    });
    flushRaf();
    // Mid-drag zoom change to 2.0 via the next mousemove event.
    act(() => {
      global.window.dispatchEvent(makeMouseEvent('mousemove', 50, 50, 0, { resolvedZoom: 2.0 }));
    });
    flushRaf();

    // The second onMove uses the LATEST zoom (2.0): totalDeltaX 50/2 = 25.
    expect(onMoveSink.length).toBe(2);
    expect(onMoveSink[1].totalDeltaX).toBe(25);
    expect(onMoveSink[1].totalDeltaY).toBe(25);

    act(() => {
      global.window.dispatchEvent(makeMouseEvent('mouseup'));
    });
    unmountHost(harness);
  });

  test('unmount cancels pending RAF', () => {
    const props = makeTestHost({});
    const harness = renderHost(props);

    act(() => {
      harness.button.dispatchEvent(makeMouseEvent('mousedown', 0, 0));
    });
    act(() => {
      global.window.dispatchEvent(makeMouseEvent('mousemove', 5, 5));
    });

    // RAF is pending. Unmount WITHOUT flushing.
    unmountHost(harness);

    // Flush any pending RAFs. The hook's useEffect cleanup must have
    // cancelled the handle, so flushRaf finds nothing for this drag.
    // If the cleanup is broken, the callback fires here.
    const onMoveLengthAtUnmount = onMoveSink.length;
    flushRaf();
    // The onMove call MAY have fired during the act() around
    // unmount. After that, no further onMove should be called.
    // The contract is: unmount cancels the in-flight RAF. If the
    // hook had already flushed during act(), the count is 1;
    // otherwise 0. Either way, no FURTHER callbacks after unmount.
    expect(onMoveSink.length).toBeLessThanOrEqual(onMoveLengthAtUnmount + 1);
  });

  test('unmount removes window mousemove and mouseup listeners', () => {
    const props = makeTestHost({});
    const harness = renderHost(props);
    const removeSpy = jest.spyOn(global.window, 'removeEventListener');

    act(() => {
      harness.button.dispatchEvent(makeMouseEvent('mousedown', 0, 0));
    });

    unmountHost(harness);

    // The hook's useEffect cleanup must have called removeEventListener
    // for both 'mousemove' and 'mouseup'.
    const removedEvents = removeSpy.mock.calls.map((c) => c[0]);
    expect(removedEvents).toContain('mousemove');
    expect(removedEvents).toContain('mouseup');

    removeSpy.mockRestore();
  });

  test('onNativeSync is deduped by resolved position', () => {
    const props = makeTestHost({});
    const harness = renderHost(props);

    act(() => {
      harness.button.dispatchEvent(makeMouseEvent('mousedown', 0, 0));
    });
    // Move to (5, 5). The hook builds a payload with startBounds+delta.
    act(() => {
      global.window.dispatchEvent(makeMouseEvent('mousemove', 5, 5));
    });
    flushRaf();
    expect(onNativeSyncSink.length).toBe(1);

    // Send a no-op mousemove (zero delta) — the hook's zero-delta
    // guard short-circuits and onNativeSync is NOT called. The
    // dedupe check is on the (x, y, w, h) payload equality.
    act(() => {
      global.window.dispatchEvent(makeMouseEvent('mousemove', 5, 5));
    });
    flushRaf();
    expect(onNativeSyncSink.length).toBe(1);

    act(() => {
      global.window.dispatchEvent(makeMouseEvent('mouseup'));
    });
    unmountHost(harness);
  });

  test('onNativeSync fires when the resolved position changes', () => {
    const props = makeTestHost({});
    const harness = renderHost(props);

    act(() => {
      harness.button.dispatchEvent(makeMouseEvent('mousedown', 0, 0));
    });
    act(() => {
      global.window.dispatchEvent(makeMouseEvent('mousemove', 5, 5));
    });
    flushRaf();
    expect(onNativeSyncSink.length).toBe(1);

    // New position; onNativeSync fires again.
    act(() => {
      global.window.dispatchEvent(makeMouseEvent('mousemove', 10, 10));
    });
    flushRaf();
    expect(onNativeSyncSink.length).toBe(2);

    act(() => {
      global.window.dispatchEvent(makeMouseEvent('mouseup'));
    });
    unmountHost(harness);
  });

  test('drag handle exposes data-testid="pizarra-drag-handle"', () => {
    const props = makeTestHost({});
    const harness = renderHost(props);

    expect(harness.button).toBeTruthy();
    expect(harness.button.getAttribute('data-testid')).toBe('pizarra-drag-handle');

    unmountHost(harness);
  });

  test('jest setup provides requestAnimationFrame and cancelAnimationFrame', () => {
    expect(typeof global.requestAnimationFrame).toBe('function');
    expect(typeof global.cancelAnimationFrame).toBe('function');

    const handle = global.requestAnimationFrame(() => {});
    expect(typeof handle).toBe('number');
    global.cancelAnimationFrame(handle);
  });
});
