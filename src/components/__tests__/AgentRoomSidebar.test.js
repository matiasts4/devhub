const React = require('react');
const { createRoot } = require('react-dom/client');
const { flushSync } = require('react-dom');
const {
  cleanupMountedRoots,
  click,
  installDom,
  renderIntoDom,
} = require('@/test-support/domHarness');
const {
  createResumableCatalogError,
  createResumableSession,
} = require('@/test-support/resumableSessionFixtures');

const mockUseAgentRegistryPolling = jest.fn();
const mockAgentCard = jest.fn();

jest.mock('@/hooks/useAgentRegistryPolling', () => ({
  __esModule: true,
  default: (...args) => mockUseAgentRegistryPolling(...args),
}));

jest.mock('lucide-react', () => {
  const icon = (name) => (props) => {
    const React = require('react');
    return React.createElement('svg', { ...props, 'data-icon': name });
  };
  return new Proxy({}, { get: (_, key) => icon(String(key)) });
});

jest.mock('../AgentCard', () => ({
  __esModule: true,
  default: (props) => {
    const React = require('react');
    const { agent, onClick, elapsedMs } = props;
    mockAgentCard(props);
    return React.createElement(
      'button',
      {
        type: 'button',
        'data-testid': `agent-card-${agent.agent_id}`,
        onClick: () => onClick?.(agent),
      },
      React.createElement('span', null, agent._displayName || agent.nombre || agent.agent_id),
      React.createElement('span', { 'data-testid': `agent-elapsed-${agent.agent_id}` }, String(elapsedMs ?? ''))
    );
  },
}));

jest.mock('../AgentLaunchDropdown', () => ({
  __esModule: true,
  default: () => {
    const React = require('react');
    return React.createElement('div', { 'data-testid': 'agent-launch-dropdown' }, 'launch');
  },
}));

const AgentRoomSidebar = require('../AgentRoomSidebar').default;

const mountedRoots = [];

function renderSidebar(props = {}) {
  return renderIntoDom(
    React.createElement(AgentRoomSidebar, {
      projectId: 'project-1',
      onAgentClick: jest.fn(),
      onReopenSession: jest.fn(),
      onTerminateAgent: jest.fn(),
      onMaximizeToggle: jest.fn(),
      isMaximized: false,
      workspaces: [],
      activePanelIds: {},
      isVisible: true,
      onToggleVisibility: jest.fn(),
      resumableSessions: [],
      resumableStatus: 'empty',
      resumableError: null,
      ...props,
    }),
    mountedRoots
  );
}

describe('AgentRoomSidebar history behavior', () => {
  let dom;

  beforeEach(() => {
    dom = installDom();
    window.localStorage.clear();
    mockAgentCard.mockClear();
    mockUseAgentRegistryPolling.mockReturnValue({
      activeAgents: [],
      inactiveAgents: [],
      loading: false,
      error: null,
    });
  });

  afterEach(() => {
    cleanupMountedRoots(mountedRoots);

    dom.window.close();
    delete global.localStorage;
    jest.clearAllMocks();
  });

  test('renders resumable history entries from shared catalog instead of hook inactive agents', async () => {
    mockUseAgentRegistryPolling.mockReturnValue({
      activeAgents: [],
      inactiveAgents: [{ agent_id: 'legacy-inactive', _displayName: 'Legacy inactive' }],
      loading: false,
      error: null,
    });

    const view = await renderSidebar({
      resumableStatus: 'success',
      resumableSessions: [createResumableSession({ sessionId: 'oc-1', title: 'Daily sync' })],
    });

    await click(Array.from(view.container.querySelectorAll('button')).find((button) => button.textContent.includes('History')));

    expect(view.container.textContent).toContain('Daily sync');
    expect(view.container.textContent).not.toContain('Legacy inactive');
  });

  test('calls onReopenSession with the shared resumable session payload', async () => {
    const onReopenSession = jest.fn();
    const session = createResumableSession({ sessionId: 'oc-77', title: 'Recovered session' });

    const view = await renderSidebar({
      onReopenSession,
      resumableStatus: 'success',
      resumableSessions: [session],
    });

    await click(Array.from(view.container.querySelectorAll('button')).find((button) => button.textContent.includes('History')));
    await click(Array.from(view.container.querySelectorAll('button')).find((button) => button.textContent.includes('Resume')));

    expect(onReopenSession).toHaveBeenCalledWith(session);
  });

  test('shows explicit empty state when shared resumable history is empty', async () => {
    const view = await renderSidebar({
      resumableStatus: 'empty',
      resumableSessions: [],
    });

    await click(Array.from(view.container.querySelectorAll('button')).find((button) => button.textContent.includes('History')));

    expect(view.container.textContent).toContain('No history yet');
    expect(view.container.textContent).toContain('Resumable sessions will appear here');
  });

  test('shows explicit history error state when shared catalog fails', async () => {
    const view = await renderSidebar({
      resumableStatus: 'error',
      resumableError: createResumableCatalogError(),
    });

    await click(Array.from(view.container.querySelectorAll('button')).find((button) => button.textContent.includes('History')));

    expect(view.container.textContent).toContain('OpenCode session listing timed out.');
  });

  test('opts into visibility-aware agent polling', async () => {
    await renderSidebar();

    expect(mockUseAgentRegistryPolling).toHaveBeenCalledWith('project-1', { visibilityAware: true });
  });

  test('refreshes elapsed time on coarse buckets instead of every second', async () => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2026-05-03T00:00:00.000Z'));

    mockUseAgentRegistryPolling.mockReturnValue({
      activeAgents: [
        {
          agent_id: 'agent-live',
          nombre: 'Hermes',
          _displayName: 'Live agent',
          _launchedAt: Date.now() - 65_000,
        },
      ],
      inactiveAgents: [],
      loading: false,
      error: null,
    });

    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);
    mountedRoots.push({ root, container });

    flushSync(() => {
      root.render(
        React.createElement(AgentRoomSidebar, {
          projectId: 'project-1',
          onAgentClick: jest.fn(),
          onReopenSession: jest.fn(),
          onTerminateAgent: jest.fn(),
          onMaximizeToggle: jest.fn(),
          isMaximized: false,
          workspaces: [],
          activePanelIds: {},
          isVisible: true,
          onToggleVisibility: jest.fn(),
          resumableSessions: [],
          resumableStatus: 'empty',
          resumableError: null,
        })
      );
    });

    const view = { container };
    expect(view.container.querySelector('[data-testid="agent-elapsed-agent-live"]')?.textContent).toBe('65000');
    expect(mockAgentCard).toHaveBeenCalledTimes(1);

    flushSync(() => {
      jest.advanceTimersByTime(5_000);
    });
    await Promise.resolve();

    expect(view.container.querySelector('[data-testid="agent-elapsed-agent-live"]')?.textContent).toBe('65000');
    expect(mockAgentCard).toHaveBeenCalledTimes(1);

    flushSync(() => {
      jest.advanceTimersByTime(10_000);
    });
    await Promise.resolve();

    expect(view.container.querySelector('[data-testid="agent-elapsed-agent-live"]')?.textContent).toBe('80000');
    expect(mockAgentCard).toHaveBeenCalledTimes(2);

    jest.useRealTimers();
  });
});
