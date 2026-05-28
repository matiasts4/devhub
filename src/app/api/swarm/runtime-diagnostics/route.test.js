const mockEnsureTTYServer = jest.fn(() => Promise.resolve());
const mockGetTTYSessionsSnapshot = jest.fn(() => []);
const mockGetOpenCodeProcesses = jest.fn(() => []);
const mockAgentRegistrySelect = jest.fn(() => []);
const mockAgentRunsSelect = jest.fn(() => []);
const mockSwarmMissionsSelect = jest.fn(() => []);
const mockAgentWorkspacesSelect = jest.fn(() => []);
const mockSupervisorSnapshotsSelect = jest.fn(() => []);

jest.mock('next/server', () => ({
  NextResponse: {
    json: jest.fn((data, opts) => ({ _data: data, _status: opts?.status || 200 })),
  },
}));

jest.mock('@/lib/terminal/ttyServer', () => ({
  ensureTTYServer: mockEnsureTTYServer,
  getTTYSessionsSnapshot: mockGetTTYSessionsSnapshot,
}));

jest.mock('@/lib/swarm/openCodeProcesses', () => ({
  getOpenCodeProcesses: mockGetOpenCodeProcesses,
}));

jest.mock('@/lib/db/localDb', () => ({
  tables: {
    agent_registry: { select: mockAgentRegistrySelect },
    agent_runs: { select: mockAgentRunsSelect },
    swarm_missions: { select: mockSwarmMissionsSelect },
    agent_workspaces: { select: mockAgentWorkspacesSelect },
    supervisor_snapshots: { select: mockSupervisorSnapshotsSelect },
  },
}));

jest.mock('fs', () => ({
  existsSync: jest.fn(() => false),
  readdirSync: jest.fn(() => []),
  readFileSync: jest.fn(() => ''),
  statSync: jest.fn(() => ({ mtimeMs: 0 })),
}));

const fs = require('fs');

describe('GET /api/swarm/runtime-diagnostics', () => {
  beforeEach(() => {
    jest.resetModules();
    jest.clearAllMocks();
  });

  it('returns unified diagnostics snapshot with canonical statuses', async () => {
    fs.existsSync.mockReturnValue(true);

    mockGetTTYSessionsSnapshot.mockReturnValue([
      {
        terminalId: 'term-1',
        alive: true,
        socketCount: 0,
        opencodeSessionId: 'oc-1',
      },
    ]);
    mockGetOpenCodeProcesses.mockReturnValue([
      {
        pid: 111,
        sessionId: 'oc-1',
        agent: 'coder',
      },
    ]);
    mockAgentRegistrySelect.mockReturnValue([{ agent_id: 'coder', status: 'running' }]);
    mockAgentRunsSelect.mockReturnValue([{ agent_id: 'coder', status: 'running' }]);
    mockSwarmMissionsSelect.mockReturnValue([{ mission_id: 'm-1', status: 'running' }]);
    mockAgentWorkspacesSelect.mockReturnValue([]);
    mockSupervisorSnapshotsSelect.mockReturnValue([]);

    const { GET } = await import('./route.js');
    const response = await GET();

    expect(response._status).toBe(200);
    expect(response._data.terminals).toHaveLength(1);
    expect(response._data.processes).toHaveLength(1);
    expect(response._data.registry).toHaveLength(1);
    expect(response._data.summary.totalTerminals).toBe(1);
    expect(response._data.summary.totalProcesses).toBe(1);
    expect(response._data.anomalies.reattachableTerminals).toEqual(['term-1']);
    expect(Array.isArray(response._data.evidence_refs)).toBe(true);
  });

  it('includes diagnosis section with findings and actions', async () => {
    fs.existsSync.mockReturnValue(true);

    mockGetTTYSessionsSnapshot.mockReturnValue([
      {
        terminalId: 'term-1',
        alive: true,
        socketCount: 0,
        opencodeSessionId: 'oc-1',
      },
    ]);
    mockGetOpenCodeProcesses.mockReturnValue([]);
    mockAgentRegistrySelect.mockReturnValue([]);
    mockAgentRunsSelect.mockReturnValue([]);
    mockSwarmMissionsSelect.mockReturnValue([]);
    mockAgentWorkspacesSelect.mockReturnValue([]);
    mockSupervisorSnapshotsSelect.mockReturnValue([]);

    const { GET } = await import('./route.js');
    const response = await GET();

    expect(response._data.diagnosis).toBeDefined();
    expect(Array.isArray(response._data.diagnosis.findings)).toBe(true);
    expect(Array.isArray(response._data.diagnosis.actions)).toBe(true);

    const reattachFinding = response._data.diagnosis.findings.find(
      (f) => f.code === 'TERMINALS_REATTACHABLE'
    );
    expect(reattachFinding).toBeDefined();
    expect(reattachFinding.severity).toBe('warning');
  });

  it('includes agentWorkspaces and supervisorSnapshots in response', async () => {
    fs.existsSync.mockReturnValue(true);

    mockGetTTYSessionsSnapshot.mockReturnValue([]);
    mockGetOpenCodeProcesses.mockReturnValue([]);
    mockAgentRegistrySelect.mockReturnValue([]);
    mockAgentRunsSelect.mockReturnValue([]);
    mockSwarmMissionsSelect.mockReturnValue([]);
    mockAgentWorkspacesSelect.mockReturnValue([
      { id: 'ws-1', agent_id: 'w1', status: 'active' },
    ]);
    mockSupervisorSnapshotsSelect.mockReturnValue([
      { task_id: 't-1', supervisor_state: 'lease_active' },
    ]);

    const { GET } = await import('./route.js');
    const response = await GET();

    expect(response._data.agentWorkspaces).toHaveLength(1);
    expect(response._data.supervisorSnapshots).toHaveLength(1);
  });
});
