/* global window, document */

const React = require('react');
const PanelStatusBadge = require('../PanelStatusBadge').default;
const { PANEL_STATUS } = require('@/components/terminal/utils/panelStatusHelpers');
const {
  cleanupMountedRoots,
  flushEffects,
  installDom,
  renderIntoDom,
  click,
} = require('@/test-support/domHarness');

const mockUsePanelAgentStatus = jest.fn();

jest.mock('@/hooks/usePanelAgentStatus', () => ({
  __esModule: true,
  default: (...args) => mockUsePanelAgentStatus(...args),
}));

const mountedRoots = [];

function createMockResult(overrides = {}) {
  return {
    status: PANEL_STATUS.IDLE,
    label: 'Inactivo',
    isPulsing: false,
    style: {
      dot: 'bg-slate-400',
      pulse: false,
      border: 'border-slate-400/40',
      bg: 'bg-slate-400/12',
      text: 'text-slate-300',
    },
    apiStatus: null,
    lastUpdated: null,
    error: null,
    details: { connectionState: null, agentRun: null, apiStatus: null },
    ...overrides,
  };
}

describe('PanelStatusBadge', () => {
  let dom;

  beforeEach(() => {
    jest.clearAllMocks();
    dom = installDom();
    window.localStorage.clear();
  });

  afterEach(() => {
    cleanupMountedRoots(mountedRoots);
    dom.window.close();
    delete global.localStorage;
  });

  test('does not render when status is idle for shell panels', async () => {
    mockUsePanelAgentStatus.mockReturnValue(createMockResult({ status: PANEL_STATUS.IDLE }));

    const view = await renderIntoDom(
      React.createElement(PanelStatusBadge, {
        panelId: 'panel-1',
        agentRun: null,
        initialCommand: null,
        connectionState: 'connected',
      }),
      mountedRoots
    );

    expect(view.container.querySelector('[data-testid="panel-status-badge-panel-1"]')).toBeNull();
  });

  test('renders when status is idle for agent panels', async () => {
    mockUsePanelAgentStatus.mockReturnValue(
      createMockResult({
        status: PANEL_STATUS.IDLE,
        label: 'Inactivo',
        details: {
          connectionState: 'connected',
          agentRun: null,
          apiStatus: null,
          terminalActivity: { agentType: 'kimi' },
        },
      })
    );

    const view = await renderIntoDom(
      React.createElement(PanelStatusBadge, {
        panelId: 'panel-1',
        agentRun: null,
        initialCommand: null,
        connectionState: 'connected',
      }),
      mountedRoots
    );

    expect(
      view.container.querySelector('[data-testid="panel-status-badge-panel-1"]')
    ).not.toBeNull();
  });

  test('renders running badge with pulsing green dot', async () => {
    mockUsePanelAgentStatus.mockReturnValue(
      createMockResult({
        status: PANEL_STATUS.RUNNING,
        label: 'Running',
        isPulsing: true,
        style: {
          dot: 'bg-emerald-400',
          pulse: true,
          border: 'border-emerald-400/40',
          bg: 'bg-emerald-400/12',
          text: 'text-emerald-300',
        },
      })
    );

    const view = await renderIntoDom(
      React.createElement(PanelStatusBadge, {
        panelId: 'panel-1',
        agentRun: { selectedAgent: 'opencode' },
        connectionState: 'connected',
      }),
      mountedRoots
    );

    const badge = view.container.querySelector('[data-testid="panel-status-badge-panel-1"]');
    expect(badge).not.toBeNull();
    expect(badge.getAttribute('data-panel-status')).toBe(PANEL_STATUS.RUNNING);
    expect(badge.textContent).toContain('Running');
    expect(badge.getAttribute('aria-label')).toContain('Estado del panel: Running');
  });

  test('renders waiting badge with amber dot', async () => {
    mockUsePanelAgentStatus.mockReturnValue(
      createMockResult({
        status: PANEL_STATUS.WAITING,
        label: 'Esperando',
        isPulsing: true,
        style: {
          dot: 'bg-amber-400',
          pulse: true,
          border: 'border-amber-400/40',
          bg: 'bg-amber-400/12',
          text: 'text-amber-300',
        },
      })
    );

    const view = await renderIntoDom(
      React.createElement(PanelStatusBadge, {
        panelId: 'panel-2',
        agentRun: { selectedAgent: 'opencode' },
        connectionState: 'connecting',
      }),
      mountedRoots
    );

    const badge = view.container.querySelector('[data-testid="panel-status-badge-panel-2"]');
    expect(badge).not.toBeNull();
    expect(badge.getAttribute('data-panel-status')).toBe(PANEL_STATUS.WAITING);
  });

  test('opens popover on click', async () => {
    mockUsePanelAgentStatus.mockReturnValue(
      createMockResult({
        status: PANEL_STATUS.ACTIVE,
        label: 'Activo',
        lastUpdated: '2026-06-27T12:00:00.000Z',
        details: {
          connectionState: 'connected',
          agentRun: { selectedAgent: 'opencode', taskTitle: 'Fix auth' },
          apiStatus: 'active',
        },
      })
    );

    const view = await renderIntoDom(
      React.createElement(PanelStatusBadge, {
        panelId: 'panel-3',
        agentRun: { selectedAgent: 'opencode' },
        connectionState: 'connected',
      }),
      mountedRoots
    );

    const badge = view.container.querySelector('[data-testid="panel-status-badge-panel-3"]');
    await click(badge);
    await flushEffects();

    const popover = view.container.querySelector('[data-state="open"]');
    expect(popover).not.toBeNull();
  });

  test('passes terminalId to the status hook', async () => {
    mockUsePanelAgentStatus.mockReturnValue(createMockResult({ status: PANEL_STATUS.IDLE }));

    await renderIntoDom(
      React.createElement(PanelStatusBadge, {
        panelId: 'panel-4',
        terminalId: 'tty-4',
        agentRun: { selectedAgent: 'opencode' },
        connectionState: 'connected',
      }),
      mountedRoots
    );

    expect(mockUsePanelAgentStatus).toHaveBeenCalledWith(
      'panel-4',
      expect.objectContaining({ terminalId: 'tty-4' })
    );
  });
});
