/**
 * PizarraTerminalGhost — pizarra-instant-enter A5.
 *
 * Contract pinned here:
 *   1. No snapshot → renders nothing (the card chrome alone covers
 *      first-ever entries; an empty ghost would only repaint chrome).
 *   2. Fresh snapshot → paints the captured rows instantly, aria-hidden,
 *      pointerEvents none.
 *   3. A `devhub:terminal-layout-settled` naming ANOTHER panel does NOT
 *      hide the ghost.
 *   4. A settled naming THIS panel starts the hide: after
 *      GHOST_LIVE_GRACE_MS the fade begins, after GHOST_FADE_MS more the
 *      ghost unmounts and the snapshot is cleared.
 *   5. GHOST_SAFETY_MS is the absolute cap even with no settled event.
 *   6. CanvasTerminal wires the ghost inside the shared-surfaces branch
 *      (source-grep, same approach as pizarraSurfaceEnterAnim).
 *
 * NOTE: no jest.resetModules here — requiring the component after a
 * registry reset loads a second React copy ("invalid hook call"). Store
 * isolation comes from _resetTerminalViewportSnapshotsForTests instead.
 * Renders use flushSync (no async flushEffects) so the tests can run
 * under jest fake timers without deadlocking real-timer awaits.
 */

const React = require('react');
const { createRoot } = require('react-dom/client');
const { flushSync } = require('react-dom');
const domHarness = require('@/test-support/domHarness');

const PizarraTerminalGhost = require('../PizarraTerminalGhost').default;
const {
  GHOST_TESTID,
  GHOST_LIVE_GRACE_MS,
  GHOST_FADE_MS,
  GHOST_SAFETY_MS,
} = require('../PizarraTerminalGhost');
const snapshotStore = require('@/lib/terminal/terminalViewportSnapshot');
const { dispatchTerminalLayoutSettled } = require('@/components/terminal/nativeLayoutSync');

let dom;
let mountedRoots;

beforeEach(() => {
  snapshotStore._resetTerminalViewportSnapshotsForTests();
  dom = domHarness.installDom();
  mountedRoots = [];
});

afterEach(() => {
  domHarness.cleanupMountedRoots(mountedRoots);
  if (dom && dom.window && dom.window.close) {
    try {
      dom.window.close();
    } catch {
      // ignore
    }
  }
});

function advance(ms) {
  flushSync(() => {
    jest.advanceTimersByTime(ms);
  });
}

function renderGhost(terminalId = 'panel-1') {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  mountedRoots.push({ root, container });
  flushSync(() => {
    root.render(React.createElement(PizarraTerminalGhost, { terminalId }));
  });
  return { container, root };
}

describe('PizarraTerminalGhost', () => {
  test('renders nothing without a snapshot', () => {
    const { container } = renderGhost();
    expect(container.querySelector(`[data-testid="${GHOST_TESTID}"]`)).toBeNull();
  });

  test('paints captured rows instantly when a fresh snapshot exists', () => {
    snapshotStore.saveTerminalViewportSnapshot('panel-1', ['$ npm run dev', 'ready in 321ms']);
    const { container } = renderGhost();
    const ghost = container.querySelector(`[data-testid="${GHOST_TESTID}"]`);
    expect(ghost).not.toBeNull();
    expect(ghost.textContent).toContain('$ npm run dev');
    expect(ghost.textContent).toContain('ready in 321ms');
    expect(ghost.getAttribute('aria-hidden')).toBe('true');
    expect(ghost.style.pointerEvents).toBe('none');
  });

  test('ignores layout-settled for other panels', () => {
    jest.useFakeTimers('modern');
    try {
      snapshotStore.saveTerminalViewportSnapshot('panel-1', ['$ mine']);
      const { container } = renderGhost('panel-1');
      dispatchTerminalLayoutSettled({ reason: 'other', panelIds: ['panel-2'] });
      advance(GHOST_LIVE_GRACE_MS + GHOST_FADE_MS + 50);
      expect(container.querySelector(`[data-testid="${GHOST_TESTID}"]`)).not.toBeNull();
      expect(snapshotStore.getTerminalViewportSnapshot('panel-1')).not.toBeNull();
    } finally {
      jest.useRealTimers();
    }
  });

  test('fades out and clears the snapshot after a settled for this panel', () => {
    jest.useFakeTimers('modern');
    try {
      snapshotStore.saveTerminalViewportSnapshot('panel-1', ['$ live soon']);
      const { container } = renderGhost('panel-1');

      dispatchTerminalLayoutSettled({ reason: 'pizarra-mode-enter', panelIds: ['panel-1'] });
      advance(GHOST_LIVE_GRACE_MS - 10);
      // Grace window not over: still visible, not yet fading.
      let ghost = container.querySelector(`[data-testid="${GHOST_TESTID}"]`);
      expect(ghost).not.toBeNull();
      expect(ghost.style.opacity).not.toBe('0');

      advance(20); // past the grace → fade starts
      ghost = container.querySelector(`[data-testid="${GHOST_TESTID}"]`);
      expect(ghost.style.opacity).toBe('0');

      advance(GHOST_FADE_MS + 10);
      expect(container.querySelector(`[data-testid="${GHOST_TESTID}"]`)).toBeNull();
      expect(snapshotStore.getTerminalViewportSnapshot('panel-1')).toBeNull();
    } finally {
      jest.useRealTimers();
    }
  });

  test('safety cap hides the ghost even without any settled event', () => {
    jest.useFakeTimers('modern');
    try {
      snapshotStore.saveTerminalViewportSnapshot('panel-1', ['$ stuck']);
      const { container } = renderGhost('panel-1');
      advance(GHOST_SAFETY_MS + GHOST_FADE_MS + 20);
      expect(container.querySelector(`[data-testid="${GHOST_TESTID}"]`)).toBeNull();
    } finally {
      jest.useRealTimers();
    }
  });

  test('CanvasTerminal wires the ghost next to the shared-surfaces portal', () => {
    const fs = require('fs');
    const path = require('path');
    const source = fs.readFileSync(path.resolve(__dirname, '../CanvasTerminal.jsx'), 'utf8');
    expect(source).toMatch(/import PizarraTerminalGhost from '\.\/PizarraTerminalGhost'/);
    expect(source).toMatch(
      /sharedSurfacesEnabled \? <PizarraTerminalGhost terminalId=\{terminalId\} \/> : null/
    );
  });
});
