/**
 * WorkspaceRightDock — pizarra keep-alive contract.
 *
 * Prevents the intermittent "submarino blank" UX where every pizarra
 * toggle remounted PizarraPane (Konva + portals) from scratch while the
 * workspace shell was already opacity:0.
 */

const React = require('react');
const { act } = require('@testing-library/react');
const domHarness = require('@/test-support/domHarness');

jest.mock('lucide-react', () => {
  const R = require('react');
  const icon = (name) => (props) => R.createElement('svg', { ...props, 'data-icon': name });
  return new Proxy({}, { get: (_, key) => icon(String(key)) });
});

jest.mock('@/components/pizarra/PizarraPane', () => {
  const R = require('react');
  return {
    __esModule: true,
    default: function MockPizarraPane() {
      return R.createElement('div', { 'data-testid': 'pizarra-pane-mock' }, 'pizarra');
    },
  };
});

jest.mock('@/components/workspace/WorkspaceBrowserPane', () => {
  const R = require('react');
  return {
    __esModule: true,
    default: function MockBrowser() {
      return R.createElement('div', { 'data-testid': 'browser-mock' });
    },
  };
});

jest.mock('@/components/workspace/FileExplorerEditorPane', () => {
  const R = require('react');
  return {
    __esModule: true,
    default: function MockEditor() {
      return R.createElement('div', { 'data-testid': 'editor-mock' });
    },
  };
});

jest.mock('@/components/workspace/WorkspaceSwarmPane', () => {
  const R = require('react');
  return {
    __esModule: true,
    default: function MockSwarm() {
      return R.createElement('div', { 'data-testid': 'swarm-mock' });
    },
  };
});

jest.mock('@/components/workspace/OperatorActionCard', () => {
  const R = require('react');
  return {
    __esModule: true,
    default: function MockCard() {
      return R.createElement('div', { 'data-testid': 'operator-card-mock' });
    },
  };
});

jest.mock('@/lib/pizarra/featureFlag', () => ({
  isPizarraSharedViewEnabled: () => false,
  _resetFlagForTests: () => {},
}));

jest.mock('@/components/terminal/nativeLayoutSync', () => ({
  dispatchTerminalLayoutSettled: jest.fn(),
}));

let dom;
let mountedRoots = [];

beforeEach(() => {
  mountedRoots = [];
  dom = domHarness.installDom();
  if (typeof global.ResizeObserver === 'undefined') {
    global.ResizeObserver = class ResizeObserver {
      observe() {}
      unobserve() {}
      disconnect() {}
    };
  }
});

afterEach(() => {
  domHarness.cleanupMountedRoots(mountedRoots);
  if (dom?.window?.close) {
    try {
      dom.window.close();
    } catch {
      // ignore
    }
  }
});

function renderDock(dockState) {
  const { default: WorkspaceRightDock } = require('../WorkspaceRightDock');
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = require('react-dom/client').createRoot(container);
  mountedRoots.push({ root, container });
  act(() => {
    root.render(
      React.createElement(WorkspaceRightDock, {
        project: { id: 'p1' },
        workspaceId: 'ws-1',
        dockState,
        onDockStateChange: () => {},
        workspaceWindows: [],
        activeWorkspaceWindowId: null,
      })
    );
  });
  return { container, root };
}

describe('WorkspaceRightDock — pizarra keep-alive', () => {
  test('keeps pizarra-host mounted after first open when leaving pizarra', () => {
    const { root } = renderDock({
      visible: true,
      activeTab: 'pizarra',
      maximized: true,
      maximizedView: 'pizarra',
      size: 32,
    });

    expect(document.querySelector('[data-testid="pizarra-host"]')).not.toBeNull();
    expect(document.querySelector('[data-testid="pizarra-pane-mock"]')).not.toBeNull();
    expect(
      document.querySelector('[data-testid="pizarra-host"]').getAttribute('data-pizarra-active')
    ).toBe('true');

    act(() => {
      root.render(
        React.createElement(require('../WorkspaceRightDock').default, {
          project: { id: 'p1' },
          workspaceId: 'ws-1',
          dockState: {
            visible: false,
            activeTab: 'browser',
            maximized: false,
            maximizedView: 'browser',
            size: 32,
          },
          onDockStateChange: () => {},
          workspaceWindows: [],
          activeWorkspaceWindowId: null,
        })
      );
    });

    const host = document.querySelector('[data-testid="pizarra-host"]');
    expect(host).not.toBeNull();
    expect(host.className).toContain('hidden');
    expect(host.getAttribute('data-pizarra-active')).toBe('false');
    expect(document.querySelector('[data-testid="pizarra-pane-mock"]')).not.toBeNull();
  });

  test('does not mount pizarra until first activation', () => {
    renderDock({
      visible: true,
      activeTab: 'browser',
      maximized: false,
      maximizedView: 'browser',
      size: 32,
    });
    expect(document.querySelector('[data-testid="pizarra-host"]')).toBeNull();
  });
});
