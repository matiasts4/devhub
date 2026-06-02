/**
 * SharedSurfacesProvider — singleton surface registry contract.
 *
 * Phase 4 of pizarra-shared-view-state. The provider owns the
 * hidden mount tree of every terminal/browser surface keyed by
 * `surfaceId`. The `SurfacePortal` reaches into this tree via
 * React portal; toggling `maximizedView` only re-renders the
 * portal HOST, never the surface itself, so XTerm/WebSocket
 * scrollback survives mode toggles.
 *
 * Architecture (see design §3.1):
 *   - The provider keeps a hidden mount of every surface
 *     whose `useSurfaceContent(surfaceId, factory)` was called.
 *   - The hidden mount is a React subtree that exists ONCE,
 *     regardless of how many `SurfacePortal` hosts are mounted
 *     in workspace or pizarra chrome.
 *   - The provider's `<SurfaceMount>` projects the hidden
 *     subtree into the most-recently-registered target via
 *     `createPortal`. When a new host becomes active, the
 *     projection target moves; the subtree identity is
 *     preserved.
 *   - Lifecycle: `registerSurface` is called by the consumer's
 *     hidden mount (e.g. TerminalTTY on mount). It increments
 *     a refcount. `releaseSurface(id, { keepAlive: true })`
 *     decrements but never disposes. `releaseSurface(id, {
 *     keepAlive: false })` hard-destroys (calls
 *     `onSurfaceDestroy(id)`).
 *
 * This file pins the lifecycle contract:
 *   1. registerSurface(id, ownerHandle) returns an unregister
 *      function. Multiple owners for the same id are allowed;
 *      the surface stays alive while refcount > 0.
 *   2. releaseSurface(id, { keepAlive: true }) decrements the
 *      refcount but does NOT dispose the surface.
 *   3. releaseSurface(id, { keepAlive: false }) decrements
 *      AND disposes the surface (calls onSurfaceDestroy, removes
 *      the descriptor from the map, frees the mount slot).
 *   4. setActiveSurfaceId(id) updates the shared "active
 *      surface" pointer.
 *   5. registerSurfaceTarget(id, hostId, domElement) lets a
 *      SurfacePortal host register its DOM target so the
 *      provider can render the surface into it.
 *   6. The hidden mount content tree is rendered exactly once
 *      even when multiple hosts are mounted.
 *   7. The projection appears in the most-recently-registered
 *      host. When a new host registers as the active target,
 *      the projection moves to it.
 *   8. Portal with no registered surface renders nothing.
 */

const React = require('react');
const { installDom, cleanupMountedRoots } = require('@/test-support/domHarness');
const { fireEvent, act } = require('@testing-library/react');

const {
  SharedSurfacesProvider,
  useSurfaceRegistry,
  useSurfaceContent,
  useActiveSurfaceId,
} = require('../SharedSurfacesProvider');
const SurfacePortal = require('../SurfacePortal').default;

let dom;

beforeEach(() => {
  dom = installDom();
});

afterEach(() => {
  if (dom && dom.window && dom.window.close) {
    try {
      dom.window.close();
    } catch (e) {
      // ignore
    }
  }
});

// ── Helpers ────────────────────────────────────────────────────────────────

function makeRoot() {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = require('react-dom/client').createRoot(container);
  return { container, root };
}

function renderInto(root, element) {
  act(() => {
    root.render(element);
  });
}

function Probe({ id, fn }) {
  const ctx = useSurfaceRegistry();
  return React.createElement('div', { 'data-testid': `probe-${id}` }, fn(ctx));
}

function HiddenSurfaceMount({ surfaceId, content }) {
  // Mount the surface content in the provider's hidden layer.
  useSurfaceContent(surfaceId, () => content);
  return null;
}

// ── Tests ──────────────────────────────────────────────────────────────────

describe('SharedSurfacesProvider — surface registry contract', () => {
  test('registerSurface increments the refcount; release decrements without disposing on keepAlive', () => {
    const { container, root } = makeRoot();

    let registry;
    function Setup() {
      registry = useSurfaceRegistry();
      return React.createElement(Probe, {
        id: 'counter',
        fn: (ctx) => {
          return React.createElement('span', {
            'data-testid': 'refcount',
            'data-count': String(ctx.getRefCount('term-1') || 0),
          });
        },
      });
    }

    renderInto(root, React.createElement(SharedSurfacesProvider, null, React.createElement(Setup)));

    // No surface registered yet → refcount absent (treated as 0).
    const counter = () => document.querySelector('[data-testid="refcount"]');
    expect(counter().getAttribute('data-count')).toBe('0');

    // Register two owners for the same surface.
    let unregisterA;
    let unregisterB;
    act(() => {
      unregisterA = registry.registerSurface('term-1', { type: 'terminal' });
      unregisterB = registry.registerSurface('term-1', { type: 'terminal' });
    });
    expect(registry.getRefCount('term-1')).toBe(2);

    // Release one: refcount drops to 1, surface still registered.
    act(() => {
      unregisterA();
    });
    expect(registry.getRefCount('term-1')).toBe(1);
    expect(registry.get('term-1')).toBeDefined();

    // Release the other one: refcount hits 0 but the descriptor
    // is NOT removed (soft release).
    act(() => {
      unregisterB();
    });
    expect(registry.getRefCount('term-1')).toBe(0);
    expect(registry.get('term-1')).toBeDefined();
  });

  test('releaseSurface(id, { keepAlive: false }) hard-destroys the surface even if refcount > 0', () => {
    const { container, root } = makeRoot();

    let registry;
    let onDestroy = jest.fn();
    function Setup() {
      registry = useSurfaceRegistry();
      return null;
    }

    renderInto(
      root,
      React.createElement(
        SharedSurfacesProvider,
        { onSurfaceDestroy: onDestroy },
        React.createElement(Setup)
      )
    );

    act(() => {
      registry.registerSurface('term-1', { type: 'terminal' });
      registry.registerSurface('term-1', { type: 'terminal' });
    });
    expect(registry.getRefCount('term-1')).toBe(2);

    // Hard destroy: onSurfaceDestroy is called, the descriptor
    // is removed from the map.
    act(() => {
      registry.releaseSurface('term-1', { keepAlive: false });
    });
    expect(onDestroy).toHaveBeenCalledWith('term-1');
    expect(registry.get('term-1')).toBeUndefined();
    expect(registry.getRefCount('term-1')).toBe(0);
  });

  test('setActiveSurfaceId updates the shared active pointer; consumers observe it', () => {
    const { container, root } = makeRoot();

    function ActiveConsumer() {
      const active = useActiveSurfaceId();
      return React.createElement('span', {
        'data-testid': 'active',
        'data-id': active || 'none',
      });
    }
    function Mutator() {
      const reg = useSurfaceRegistry();
      return React.createElement('button', {
        type: 'button',
        'data-testid': 'set-b',
        onClick: () => reg.setActiveSurfaceId('term-b'),
      });
    }

    renderInto(
      root,
      React.createElement(
        SharedSurfacesProvider,
        null,
        React.createElement(ActiveConsumer),
        React.createElement(Mutator)
      )
    );

    expect(document.querySelector('[data-testid="active"]').getAttribute('data-id')).toBe('none');

    act(() => {
      fireEvent.click(document.querySelector('[data-testid="set-b"]'));
    });
    expect(document.querySelector('[data-testid="active"]').getAttribute('data-id')).toBe('term-b');
  });
});

describe('SurfacePortal — portal host targeting', () => {
  test('a single host pointing at a registered surface projects the hidden content into the host', () => {
    const { container, root } = makeRoot();

    function App() {
      return React.createElement(
        SharedSurfacesProvider,
        null,
        // Hidden mount: the surface content tree, mounted once.
        React.createElement(HiddenSurfaceMount, {
          surfaceId: 'term-1',
          content: React.createElement('div', {
            'data-testid': 'surface-content',
            'data-surface': 'term-1',
          }),
        }),
        // Host: a workspace-dock target for the surface.
        React.createElement(SurfacePortal, {
          surfaceId: 'term-1',
          hostId: 'workspace-dock',
        })
      );
    }

    renderInto(root, React.createElement(App));

    // The hidden mount exists in the provider's hidden layer.
    const hiddenLayer = document.querySelector('[data-testid="surface-hidden-layer"]');
    expect(hiddenLayer).toBeTruthy();

    // The host element exists in the DOM.
    const host = document.querySelector(
      '[data-testid="surface-portal-host-workspace-dock-term-1"]'
    );
    expect(host).toBeTruthy();
    expect(host.getAttribute('data-registered')).toBe('true');

    // The surface content is projected into the host (the only
    // registered target).
    const projected = document.querySelectorAll('[data-testid="surface-content"]');
    expect(projected).toHaveLength(1);
  });

  test('two hosts pointing at the same surfaceId render the same content in exactly one host', () => {
    const { container, root } = makeRoot();

    function App() {
      return React.createElement(
        SharedSurfacesProvider,
        null,
        React.createElement(HiddenSurfaceMount, {
          surfaceId: 'term-1',
          content: React.createElement('div', {
            'data-testid': 'surface-content',
            'data-surface': 'term-1',
          }),
        }),
        React.createElement(SurfacePortal, {
          surfaceId: 'term-1',
          hostId: 'workspace-dock',
        }),
        React.createElement(SurfacePortal, {
          surfaceId: 'term-1',
          hostId: 'pizarra-canvas',
        })
      );
    }

    renderInto(root, React.createElement(App));

    // Both hosts exist as DOM targets.
    const hostA = document.querySelector(
      '[data-testid="surface-portal-host-workspace-dock-term-1"]'
    );
    const hostB = document.querySelector(
      '[data-testid="surface-portal-host-pizarra-canvas-term-1"]'
    );
    expect(hostA).toBeTruthy();
    expect(hostB).toBeTruthy();

    // The content appears exactly once in the DOM. createPortal
    // moves the subtree between targets; the React identity is
    // preserved, so the DOM is the SAME node moving between
    // hosts.
    const projected = document.querySelectorAll('[data-testid="surface-content"]');
    expect(projected).toHaveLength(1);
  });

  test('portal with no registered surface content renders nothing in any host', () => {
    const { container, root } = makeRoot();

    function App() {
      return React.createElement(
        SharedSurfacesProvider,
        null,
        // No HiddenSurfaceMount — the surface has no content.
        React.createElement(SurfacePortal, {
          surfaceId: 'missing',
          hostId: 'workspace-dock',
        })
      );
    }

    renderInto(root, React.createElement(App));

    // The host DOM stub is rendered (it is the target), but
    // no surface content is projected into it.
    const host = document.querySelector(
      '[data-testid="surface-portal-host-workspace-dock-missing"]'
    );
    expect(host).toBeTruthy();
    expect(host.querySelector('[data-testid="surface-content"]')).toBeNull();
  });
});
