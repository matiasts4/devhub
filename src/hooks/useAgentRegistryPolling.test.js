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
    mockDbChain.order.mockImplementation(() =>
      Promise.resolve({
        data: [
          {
            agent_id: 'agent-1',
            current_task_id: 'task-1',
            nombre: 'opencode',
            status: 'running',
            last_heartbeat: new Date().toISOString(),
          },
        ],
      })
    );
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
      json: async () => ({
        sessions: [{ terminalId: 'panel-1', alive: true, opencodeSessionId: 'oc-1' }],
      }),
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

    const view = await renderIntoDom(
      React.createElement(Harness, { projectId: 'project-1' }),
      mountedRoots
    );
    await waitFor(() => {
      expect(view.container.querySelector('[data-testid="active-count"]')?.textContent).toBe('1');
    });
    expect(view.container.querySelector('[data-testid="inactive-count"]')?.textContent).toBe('0');
    expect(view.container.querySelector('[data-testid="active-labels"]')?.textContent).toContain(
      'Active run'
    );
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

  test('keeps polling consumers focused on blocked supervisor projections without reviving inactive history', async () => {
    mockDbChain.order.mockImplementation(() =>
      Promise.resolve({
        data: [
          {
            agent_id: 'agent-blocked',
            current_task_id: 'task-blocked',
            nombre: 'opencode',
            status: 'running',
            last_heartbeat: new Date().toISOString(),
            workspace_id: 'ws-blocked',
          },
        ],
      })
    );
    window.localStorage.setItem(
      'devhub_agent_runs',
      JSON.stringify({
        'ws-blocked': {
          panelId: 'panel-blocked',
          taskTitle: 'Blocked by unchanged failure',
          selectedAgent: 'worker',
          supervisor_snapshot: {
            supervisor_state: 'blocked',
            outcome: 'block',
            reason_class: 'unchanged_failure',
            attempt_count: 3,
            task_retry_count: 2,
          },
        },
      })
    );
    fetchSpy.mockResolvedValue({
      ok: true,
      json: async () => ({ sessions: [{ terminalId: 'panel-blocked', alive: true }] }),
    });
    mockGetAgentRegistryLiveSnapshot.mockReturnValue({
      activeAgents: [
        {
          agent_id: 'agent-blocked',
          _displayName: 'Blocked by unchanged failure',
          supervisor: {
            supervisor_state: 'blocked',
            reason_class: 'unchanged_failure',
          },
        },
      ],
      activeAgentsCount: 1,
    });

    const view = await renderIntoDom(
      React.createElement(Harness, { projectId: 'project-1' }),
      mountedRoots
    );

    await waitFor(() => {
      expect(view.container.querySelector('[data-testid="active-count"]')?.textContent).toBe('1');
    });
    expect(view.container.querySelector('[data-testid="inactive-count"]')?.textContent).toBe('0');
    expect(view.container.querySelector('[data-testid="active-labels"]')?.textContent).toContain(
      'Blocked by unchanged failure'
    );
    expect(fetchSpy).toHaveBeenCalledWith('/api/terminal/sessions', { cache: 'no-store' });
  });

  test('keeps approval and orphan supervisor polling payloads in active registry results', async () => {
    mockDbChain.order.mockImplementation(() =>
      Promise.resolve({
        data: [
          {
            agent_id: 'agent-approval',
            current_task_id: 'task-approval',
            nombre: 'opencode',
            status: 'running',
            last_heartbeat: new Date().toISOString(),
            workspace_id: 'ws-approval',
          },
          {
            agent_id: 'agent-orphan',
            current_task_id: 'task-orphan',
            nombre: 'worker',
            status: 'running',
            last_heartbeat: new Date().toISOString(),
            workspace_id: 'ws-orphan',
          },
        ],
      })
    );
    window.localStorage.setItem(
      'devhub_agent_runs',
      JSON.stringify({
        'ws-approval': {
          panelId: 'panel-approval',
          taskTitle: 'Awaiting approval',
          supervisor_snapshot: {
            supervisor_state: 'awaiting_approval',
            reason_class: 'approval_required',
          },
        },
        'ws-orphan': {
          panelId: 'panel-orphan',
          taskTitle: 'Recover orphan workspace',
          supervisor_snapshot: {
            supervisor_state: 'recovering_orphan',
            reason_class: 'orphaned_workspace',
          },
        },
      })
    );
    fetchSpy.mockResolvedValue({
      ok: true,
      json: async () => ({
        sessions: [
          { terminalId: 'panel-approval', alive: true },
          { terminalId: 'panel-orphan', alive: true },
        ],
      }),
    });
    mockGetAgentRegistryLiveSnapshot.mockReturnValue({
      activeAgents: [
        {
          agent_id: 'agent-approval',
          _displayName: 'Awaiting approval',
          supervisor: {
            supervisor_state: 'awaiting_approval',
            reason_class: 'approval_required',
          },
        },
        {
          agent_id: 'agent-orphan',
          _displayName: 'Recover orphan workspace',
          supervisor: {
            supervisor_state: 'recovering_orphan',
            reason_class: 'orphaned_workspace',
          },
        },
      ],
      activeAgentsCount: 2,
    });

    const view = await renderIntoDom(
      React.createElement(Harness, { projectId: 'project-1' }),
      mountedRoots
    );

    await waitFor(() => {
      expect(view.container.querySelector('[data-testid="active-count"]')?.textContent).toBe('2');
    });
    expect(view.container.querySelector('[data-testid="inactive-count"]')?.textContent).toBe('0');
    const labels = view.container.querySelector('[data-testid="active-labels"]')?.textContent || '';
    expect(labels).toContain('Awaiting approval');
    expect(labels).toContain('Recover orphan workspace');
  });

  test('does not auto-demote stale heartbeat agents when live terminal evidence exists', async () => {
    const staleHeartbeat = new Date(Date.now() - 95 * 1000).toISOString();

    mockDbChain.order.mockImplementation(() =>
      Promise.resolve({
        data: [
          {
            agent_id: 'agent-live-stale',
            current_task_id: 'task-live-stale',
            workspace_id: 'ws-live-stale',
            status: 'running',
            last_heartbeat: staleHeartbeat,
          },
        ],
      })
    );

    window.localStorage.setItem(
      'devhub_agent_runs',
      JSON.stringify({
        'ws-live-stale': {
          panelId: 'panel-live-stale',
          selectedAgent: 'opencode',
          opencodeSessionId: 'oc-live-stale',
          taskTitle: 'Live stale agent',
        },
      })
    );

    fetchSpy.mockResolvedValue({
      ok: true,
      json: async () => ({
        sessions: [
          {
            terminalId: 'panel-live-stale',
            alive: true,
            opencodeSessionId: 'oc-live-stale',
          },
        ],
      }),
    });

    mockGetAgentRegistryLiveSnapshot.mockReturnValue({
      activeAgents: [
        {
          agent_id: 'agent-live-stale',
          _displayName: 'Live stale agent',
        },
      ],
      activeAgentsCount: 1,
    });

    const view = await renderIntoDom(
      React.createElement(Harness, { projectId: 'project-1' }),
      mountedRoots
    );

    await waitFor(() => {
      expect(view.container.querySelector('[data-testid="active-count"]')?.textContent).toBe('1');
    });

    expect(mockDbChain.update).not.toHaveBeenCalled();
  });
});
