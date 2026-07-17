/**
 * TerminalTTY â€” singleton lifecycle contract (Phase 4 of
 * pizarra-shared-view-state).
 *
 * The `TerminalTTY` component is promoted to a singleton when
 * mounted inside a `SharedSurfacesProvider`. A `surfaceId` prop
 * ties the instance to a stable surface descriptor in the
 * provider. The contract:
 *
 *   1. On mount with `surfaceId`, the component registers
 *      with the provider and starts the WS / VTE lease exactly
 *      ONCE. The surface is "kept alive" by default.
 *   2. On a target switch (e.g. workspace â†’ pizarra), the
 *      underlying TerminalTTY React instance is preserved â€”
 *      the parent may render a different mount tree, but the
 *      surface is re-targeted. The WS / VTE lease is NOT
 *      re-opened. `setNativeVtePanelVisibility` is NOT
 *      called with `visible:false` on a target switch.
 *   3. On the explicit close path (X button â†’ `onClose`
 *      callback OR an explicit `destroySurface` call from the
 *      parent), the component fires `releaseSurface(id, {
 *      keepAlive: false })`. The provider's destroy handler
 *      runs the WS close + XTerm dispose.
 *   4. The existing close-button contract from Phase 0 / 1
 *      still holds: `onClose` is only fired on user click,
 *      never on React unmount.
 *
 * Strategy: mock `@/components/TerminalTTY` indirectly by
 * testing the bridge to the provider. We mount a wrapper
 * around a `MockTerminalTTYInner` (simulating the
 * `useSharedSurface` integration) inside a
 * `SharedSurfacesProvider`, and assert the WS / VTE lifecycle.
 */

const React = require('react');
const { installDom, cleanupMountedRoots } = require('@/test-support/domHarness');
const { act } = require('@testing-library/react');

const {
  SharedSurfacesProvider,
  useSurfaceRegistry,
  useSurfaceContent,
} = require('../SharedSurfacesProvider');
const SurfacePortal = require('../SurfacePortal').default;

let dom;
const mountedRoots = [];

beforeEach(() => {
  dom = installDom();
});

afterEach(() => {
  cleanupMountedRoots(mountedRoots);
  if (dom && dom.window && dom.window.close) {
    try {
      dom.window.close();
    } catch (e) {
      // ignore
    }
  }
});

// â”€â”€ Mocks â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

const wsOpenSink = [];
const wsCloseSink = [];
let nextWebSocketId = 0;

class MockWebSocket {
  constructor(url) {
    this.url = url;
    this.id = ++nextWebSocketId;
    this.readyState = 0; // CONNECTING
    wsOpenSink.push(this);
    // Simulate async open.
    setTimeout(() => {
      this.readyState = 1; // OPEN
      if (this.onopen) this.onopen({});
    }, 0);
  }
  close() {
    wsCloseSink.push(this);
    this.readyState = 3; // CLOSED
    if (this.onclose) this.onclose({ code: 1000, reason: 'mock-close' });
  }
  send() {}
}
global.WebSocket = MockWebSocket;
global.WebSocket.OPEN = 1;
global.WebSocket.CONNECTING = 0;
global.WebSocket.CLOSING = 2;
global.WebSocket.CLOSED = 3;

jest.mock('framer-motion', () => ({
  motion: {
    div: (() => {
      const R = require('react');
      return R.forwardRef(({ children, ...props }, ref) =>
        R.createElement('div', { ...props, ref }, children)
      );
    })(),
  },
}));

jest.mock(
  '@xterm/xterm',
  () => ({
    Terminal: jest.fn().mockImplementation(() => ({
      rows: 24,
      cols: 80,
      loadAddon: jest.fn(),
      open: jest.fn(),
      onData: jest.fn(),
      focus: jest.fn(),
      write: jest.fn(),
      writeln: jest.fn(),
      paste: jest.fn(),
      refresh: jest.fn(),
      clearTextureAtlas: jest.fn(),
      dispose: jest.fn(),
      getSelection: jest.fn(() => ''),
      clear: jest.fn(),
      scrollToLine: jest.fn(),
    })),
  }),
  { virtual: true }
);

jest.mock(
  '@xterm/addon-fit',
  () => ({
    FitAddon: jest.fn().mockImplementation(() => ({ fit: jest.fn() })),
  }),
  { virtual: true }
);

jest.mock(
  '@xterm/addon-search',
  () => ({
    SearchAddon: jest.fn().mockImplementation(() => ({
      findNext: jest.fn(),
      findPrevious: jest.fn(),
    })),
  }),
  { virtual: true }
);

// â”€â”€ Helpers â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

function clearSinks() {
  wsOpenSink.length = 0;
  wsCloseSink.length = 0;
}

function renderApp(element) {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = require('react-dom/client').createRoot(container);
  mountedRoots.push({ root, container });
  act(() => {
    root.render(element);
  });
  return { container, root };
}

// A simplified inner component that mirrors the TerminalTTY
// lifecycle hooks we care about: registers with the provider,
// opens WS on mount, and exposes a `destroySurface` ref. The
// real TerminalTTY does much more (xterm.js, nativeVte, search,
// etc.) â€” this test focuses on the registry bridge, not the
// xterm rendering.
function TerminalInner({ surfaceId, onUserClose }) {
  const registry = useSurfaceRegistry();
  const wsRef = React.useRef(null);

  // Register the surface on mount; soft-release on unmount.
  React.useEffect(() => {
    const unregister = registry.registerSurface(surfaceId, { type: 'terminal' });
    return () => unregister(); // soft release, keepAlive: true is the default
  }, [registry, surfaceId]);

  // Open the WebSocket once per surfaceId. Re-renders do NOT
  // re-open it.
  React.useEffect(() => {
    if (wsRef.current) return;
    const ws = new global.WebSocket(`ws://mock/${surfaceId}`);
    wsRef.current = ws;
    return () => {
      // Soft cleanup: do NOT close the WS on unmount; the
      // surface is kept alive. Only `destroySurface` below
      // closes the WS.
    };
  }, [surfaceId]);

  // Expose a destroySurface ref that the parent can call to
  // hard-destroy the surface (close WS, fire onSurfaceDestroy).
  React.useImperativeHandle(
    React.useRef(null),
    () => ({
      destroySurface: () => {
        if (wsRef.current) {
          wsRef.current.close();
          wsRef.current = null;
        }
        registry.releaseSurface(surfaceId, { keepAlive: false });
      },
    }),
    [registry, surfaceId]
  );

  return React.createElement(
    'div',
    { 'data-testid': 'mock-terminal-inner', 'data-surface-id': surfaceId },
    React.createElement(
      'button',
      {
        type: 'button',
        'data-testid': 'close',
        onClick: onUserClose,
      },
      'X'
    )
  );
}

function SurfaceMount({ surfaceId, onUserClose }) {
  useSurfaceContent(surfaceId, () =>
    React.createElement(TerminalInner, { surfaceId, onUserClose })
  );
  return null;
}

function App({ surfaceId, hostIds, onUserClose, onSurfaceDestroy }) {
  return React.createElement(
    SharedSurfacesProvider,
    { onSurfaceDestroy },
    React.createElement(SurfaceMount, { surfaceId, onUserClose }),
    ...hostIds.map((hostId) => React.createElement(SurfacePortal, { surfaceId, hostId }))
  );
}

// â”€â”€ Tests â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

describe('TerminalTTY â€” singleton lifecycle (Phase 4)', () => {
  beforeEach(() => {
    clearSinks();
    nextWebSocketId = 0;
  });

  test('mounts once, opens WebSocket exactly once per surfaceId', () => {
    const onDestroy = jest.fn();
    renderApp(
      React.createElement(App, {
        surfaceId: 'term-1',
        hostIds: ['workspace-dock'],
        onUserClose: null,
        onSurfaceDestroy: onDestroy,
      })
    );

    return new Promise((resolve) => setTimeout(resolve, 10)).then(() => {
      expect(wsOpenSink).toHaveLength(1);
      expect(wsOpenSink[0].url).toContain('term-1');
      expect(wsCloseSink).toHaveLength(0);
    });
  });

  test('a target switch (workspace-dock â†’ pizarra-canvas) does NOT close the WebSocket', () => {
    const onDestroy = jest.fn();
    const { container, root } = renderApp(
      React.createElement(App, {
        surfaceId: 'term-1',
        hostIds: ['workspace-dock'],
        onUserClose: null,
        onSurfaceDestroy: onDestroy,
      })
    );

    return new Promise((resolve) => setTimeout(resolve, 10)).then(() => {
      expect(wsOpenSink).toHaveLength(1);

      // Re-render with the pizarra host active instead. The
      // surface stays alive; the WS stays open.
      act(() => {
        root.render(
          React.createElement(App, {
            surfaceId: 'term-1',
            hostIds: ['pizarra-canvas'],
            onUserClose: null,
            onSurfaceDestroy: onDestroy,
          })
        );
      });
      return new Promise((resolve) => setTimeout(resolve, 10)).then(() => {
        expect(wsOpenSink).toHaveLength(1); // still 1, not 2
        expect(wsCloseSink).toHaveLength(0);
      });
    });
  });

  test('5 consecutive target switches open the WebSocket exactly once', () => {
    const onDestroy = jest.fn();
    const { container, root } = renderApp(
      React.createElement(App, {
        surfaceId: 'term-1',
        hostIds: ['workspace-dock'],
        onUserClose: null,
        onSurfaceDestroy: onDestroy,
      })
    );

    return new Promise((resolve) => setTimeout(resolve, 10)).then(async () => {
      expect(wsOpenSink).toHaveLength(1);

      const hostCycle = [
        'pizarra-canvas',
        'workspace-dock',
        'pizarra-canvas',
        'workspace-dock',
        'pizarra-canvas',
      ];
      for (const hostId of hostCycle) {
        act(() => {
          root.render(
            React.createElement(App, {
              surfaceId: 'term-1',
              hostIds: [hostId],
              onUserClose: null,
              onSurfaceDestroy: onDestroy,
            })
          );
        });
        await new Promise((resolve) => setTimeout(resolve, 5));
      }
      expect(wsOpenSink).toHaveLength(1); // still 1
      expect(wsCloseSink).toHaveLength(0);
    });
  });

  test('explicit destroySurface closes the WebSocket AND fires the provider destroy handler', () => {
    const onDestroy = jest.fn();
    function ClosableInner({ surfaceId, triggerRef }) {
      const registry = useSurfaceRegistry();
      const wsRef = React.useRef(null);
      React.useEffect(() => {
        const unregister = registry.registerSurface(surfaceId, { type: 'terminal' });
        return () => unregister();
      }, [registry, surfaceId]);
      React.useEffect(() => {
        if (wsRef.current) return;
        wsRef.current = new global.WebSocket(`ws://mock/${surfaceId}`);
      }, [surfaceId]);
      React.useImperativeHandle(
        triggerRef,
        () => ({
          destroy: () => {
            if (wsRef.current) {
              wsRef.current.close();
              wsRef.current = null;
            }
            registry.releaseSurface(surfaceId, { keepAlive: false });
          },
        }),
        [registry, surfaceId]
      );
      return React.createElement('div', { 'data-testid': 'inner' });
    }
    function ClosableMount({ surfaceId, triggerRef }) {
      useSurfaceContent(surfaceId, () =>
        React.createElement(ClosableInner, { surfaceId, triggerRef })
      );
      return null;
    }
    function ClosableApp({ triggerRef }) {
      return React.createElement(
        SharedSurfacesProvider,
        { onSurfaceDestroy: onDestroy },
        React.createElement(ClosableMount, { surfaceId: 'term-1', triggerRef }),
        React.createElement(SurfacePortal, { surfaceId: 'term-1', hostId: 'workspace-dock' })
      );
    }
    const triggerRef = React.createRef();
    const { container, root } = renderApp(React.createElement(ClosableApp, { triggerRef }));
    return new Promise((resolve) => setTimeout(resolve, 10)).then(() => {
      expect(wsOpenSink).toHaveLength(1);
      // Explicit destroy: WS closes AND onSurfaceDestroy is fired.
      act(() => {
        if (triggerRef.current) triggerRef.current.destroy();
      });
      expect(wsCloseSink).toHaveLength(1);
      expect(onDestroy).toHaveBeenCalledWith('term-1');
    });
  });
});
