const React = require('react');
const useAgentRegistryPolling = require('./useAgentRegistryPolling').default;
const {
  cleanupMountedRoots,
  flushEffects,
  installDom,
  renderIntoDom,
} = require('@/test-support/domHarness');

const mockDbChain = {
  select: jest.fn(() => mockDbChain),
  eq: jest.fn(() => mockDbChain),
  order: jest.fn(),
  update: jest.fn(() => mockDbChain),
  delete: jest.fn(() => mockDbChain),
};
const mockDb = {
  from: jest.fn(() => mockDbChain),
};
const mockGetAgentRegistryLiveSnapshot = jest.fn();

jest.mock('@/lib/db/localClient', () => ({
  createClient: () => mockDb,
}));

jest.mock('@/lib/agentRegistryLive', () => ({
  getAgentRegistryLiveSnapshot: (...args) => mockGetAgentRegistryLiveSnapshot(...args),
}));

const mountedRoots = [];

async function waitFor(assertion, attempts = 10) {
  let lastError;
  for (let index = 0; index < attempts; index += 1) {
    try {
      assertion();
      return;
    } catch (error) {
      lastError = error;
      await flushEffects();
    }
  }
  throw lastError;
}

function Harness({ projectId }) {
  const { activeAgents, inactiveAgents, loading, error } = useAgentRegistryPolling(projectId);
  return React.createElement(
    'div',
    null,
    React.createElement('div', { 'data-testid': 'loading' }, String(loading)),
    React.createElement('div', { 'data-testid': 'error' }, error || ''),
    React.createElement('div', { 'data-testid': 'active-count' }, String(activeAgents.length)),
    React.createElement('div', { 'data-testid': 'inactive-count' }, String(inactiveAgents.length)),
    React.createElement(
      'div',
      { 'data-testid': 'active-labels' },
      activeAgents.map((agent) =>
        React.createElement('span', { key: agent.agent_id }, agent._displayName || agent.agent_id)
      )
    )
  );
}

describe('useAgentRegistryPolling', () => {
  let dom;
  let fetchSpy;
  let intervalSpy;

  beforeEach(() => {
    jest.clearAllMocks();
    dom = installDom();
    window.localStorage.clear();

    mockDbChain.order.mockImplementation(() => Promise.resolve({ data: [] }));
    mockDbChain.select.mockImplementation(() => mockDbChain);
    mockDbChain.eq.mockImplementation(() => mockDbChain);
    mockDbChain.update.mockImplementation(() => mockDbChain);
    mockDbChain.delete.mockImplementation(() => mockDbChain);
    mockGetAgentRegistryLiveSnapshot.mockReturnValue({ activeAgents: [], activeAgentsCount: 0 });

    fetchSpy = jest.spyOn(global, 'fetch').mockResolvedValue({
      ok: true,
      json: async () => ({ sessions: [] }),
    });
    intervalSpy = jest.spyOn(global, 'setInterval').mockImplementation(() => 123);
    jest.spyOn(global, 'clearInterval').mockImplementation(() => {});
  });

  afterEach(() => {
    cleanupMountedRoots(mountedRoots);

    fetchSpy.mockRestore();
    intervalSpy.mockRestore();
    dom.window.close();
    delete global.localStorage;
  });

  test('keeps active/live polling focused on registry plus live sessions and leaves inactive history empty', async () => {
    mockDbChain.order.mockImplementation(() => Promise.resolve({
      data: [
        {
          agent_id: 'agent-1',
          current_task_id: 'task-1',
          nombre: 'opencode',
          status: 'running',
          last_heartbeat: new Date().toISOString(),
        },
      ],
    }));
    window.localStorage.setItem(
      'devhub_agent_runs',
      JSON.stringify({
        'task-1': {
          panelId: 'panel-1',
          taskTitle: 'Active run',
          selectedAgent: 'opencode',
          opencodeSessionId: 'oc-1',
        },
      })
    );
    fetchSpy.mockResolvedValue({
      ok: true,
      json: async () => ({ sessions: [{ terminalId: 'panel-1', alive: true, opencodeSessionId: 'oc-1' }] }),
    });
    mockGetAgentRegistryLiveSnapshot.mockReturnValue({
      activeAgents: [
        {
          agent_id: 'agent-1',
          _displayName: 'Active run',
        },
      ],
      activeAgentsCount: 1,
    });

    const view = await renderIntoDom(React.createElement(Harness, { projectId: 'project-1' }), mountedRoots);
    await waitFor(() => {
      expect(view.container.querySelector('[data-testid="active-count"]')?.textContent).toBe('1');
    });
    expect(view.container.querySelector('[data-testid="inactive-count"]')?.textContent).toBe('0');
    expect(view.container.querySelector('[data-testid="active-labels"]')?.textContent).toContain('Active run');
    expect(fetchSpy).toHaveBeenCalledWith('/api/terminal/sessions', { cache: 'no-store' });
    expect(intervalSpy).toHaveBeenCalled();
  });

  test('can opt into visibility-aware backoff without changing the default polling contract', async () => {
    const Hook = ({ projectId }) => {
      const result = useAgentRegistryPolling(projectId, { visibilityAware: true });
      return React.createElement('div', { 'data-testid': 'loading' }, String(result.loading));
    };

    Object.defineProperty(document, 'visibilityState', {
      configurable: true,
      get: () => 'hidden',
    });

    await renderIntoDom(React.createElement(Hook, { projectId: 'project-1' }), mountedRoots);

    expect(intervalSpy).not.toHaveBeenCalled();
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});
