const {
  upsertOpenCodeAgentRunForPanel,
  applyOpenCodeSessionToWorkspaces,
  persistOpenCodeSessionDetection,
} = require('../opencodeSessionPersistence');

function createStorage(initial = {}) {
  const values = new Map(Object.entries(initial));
  return {
    getItem: jest.fn((key) => (values.has(key) ? values.get(key) : null)),
    setItem: jest.fn((key, value) => values.set(key, value)),
    removeItem: jest.fn((key) => values.delete(key)),
  };
}

describe('opencodeSessionPersistence', () => {
  test('upsertOpenCodeAgentRunForPanel creates a durable run when panel has no prior task', () => {
    const storage = createStorage();

    const result = upsertOpenCodeAgentRunForPanel(storage, {
      panelId: 'p42',
      sessionId: 'oc-detected-1',
    });

    expect(result.changed).toBe(true);
    expect(result.taskId).toBe('oc-panel-p42');
    expect(result.runs['oc-panel-p42']).toMatchObject({
      panelId: 'p42',
      opencodeSessionId: 'oc-detected-1',
      launchOrigin: 'opencode-session-detected',
      restorePolicy: 'auto',
    });
    expect(storage.setItem).toHaveBeenCalledWith(
      'devhub_agent_runs',
      expect.stringContaining('oc-detected-1')
    );
  });

  test('applyOpenCodeSessionToWorkspaces normalizes panel command', () => {
    const { workspaces, changed } = applyOpenCodeSessionToWorkspaces(
      [
        {
          id: 'ws1',
          columns: [{ panels: [{ id: 'p1', initialCommand: 'opencode' }] }],
        },
      ],
      'p1',
      'oc-detected-2'
    );

    expect(changed).toBe(true);
    expect(workspaces[0].columns[0].panels[0].initialCommand).toBe(
      'opencode --session oc-detected-2'
    );
  });

  test('persistOpenCodeSessionDetection updates runs and workspaces together', () => {
    const storage = createStorage();
    const result = persistOpenCodeSessionDetection(storage, {
      panelId: 'p9',
      sessionId: 'oc-detected-9',
      workspaces: [
        {
          id: 'ws1',
          columns: [{ panels: [{ id: 'p9', initialCommand: 'opencode', cwd: '/tmp' }] }],
        },
      ],
    });

    expect(result.changed).toBe(true);
    expect(result.workspaces[0].columns[0].panels[0].initialCommand).toBe(
      'opencode --session oc-detected-9'
    );
    expect(result.runs['oc-panel-p9'].opencodeSessionId).toBe('oc-detected-9');
  });
});