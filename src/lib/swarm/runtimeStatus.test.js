import {
  RUNTIME_STATUS,
  createRuntimeDiagnosticsSnapshot,
  detectQuotaSignals,
} from './runtimeStatus';

describe('runtimeStatus', () => {
  it('marks alive terminals without sockets as reattachable', () => {
    const snapshot = createRuntimeDiagnosticsSnapshot({
      terminalSessions: [
        {
          terminalId: 'term-1',
          alive: true,
          socketCount: 0,
          opencodeSessionId: 'oc-1',
        },
      ],
      swarmProcesses: [],
      agentRegistry: [],
      agentRuns: [],
      swarmMissions: [],
      crashDumps: [],
      logSignals: { quotaBlocked: false, quotaMatches: [] },
    });

    expect(snapshot.terminals).toHaveLength(1);
    expect(snapshot.terminals[0].status).toBe(RUNTIME_STATUS.REATTACHABLE);
    expect(snapshot.anomalies.reattachableTerminals).toEqual(['term-1']);
  });

  it('marks unmatched processes as orphaned-process', () => {
    const snapshot = createRuntimeDiagnosticsSnapshot({
      terminalSessions: [],
      swarmProcesses: [
        {
          pid: 4242,
          sessionId: 'oc-77',
          agent: 'coder',
        },
      ],
      agentRegistry: [],
      agentRuns: [],
      swarmMissions: [],
      crashDumps: [],
      logSignals: { quotaBlocked: false, quotaMatches: [] },
    });

    expect(snapshot.processes).toHaveLength(1);
    expect(snapshot.processes[0].status).toBe(RUNTIME_STATUS.ORPHANED_PROCESS);
    expect(snapshot.anomalies.orphanedProcesses).toEqual([4242]);
  });

  it('marks registry entries as stale-registry when process is missing', () => {
    // Contract: an ACTIVE run keeps the agent "active" even without a process
    // (classifyRegistry checks hasActiveRun before stale). stale-registry only
    // applies when there is no process AND no active run for the idle agent.
    const snapshot = createRuntimeDiagnosticsSnapshot({
      terminalSessions: [],
      swarmProcesses: [],
      agentRegistry: [
        {
          agent_id: 'auditor',
          status: 'idle',
        },
      ],
      agentRuns: [
        {
          agent_id: 'auditor',
          status: 'completed',
        },
      ],
      swarmMissions: [],
      crashDumps: [],
      logSignals: { quotaBlocked: false, quotaMatches: [] },
    });

    expect(snapshot.registry).toHaveLength(1);
    expect(snapshot.registry[0].status).toBe(RUNTIME_STATUS.STALE_REGISTRY);
    expect(snapshot.anomalies.staleRegistryAgents).toEqual(['auditor']);
  });

  it('keeps registry entries active when the agent still has a running run', () => {
    const snapshot = createRuntimeDiagnosticsSnapshot({
      terminalSessions: [],
      swarmProcesses: [],
      agentRegistry: [{ agent_id: 'auditor', status: 'idle' }],
      agentRuns: [{ agent_id: 'auditor', status: 'running' }],
      swarmMissions: [],
      crashDumps: [],
      logSignals: { quotaBlocked: false, quotaMatches: [] },
    });

    expect(snapshot.registry[0].status).toBe(RUNTIME_STATUS.ACTIVE);
    expect(snapshot.anomalies.staleRegistryAgents).toEqual([]);
  });

  it('promotes quota blocked status when 429 signal is present', () => {
    const snapshot = createRuntimeDiagnosticsSnapshot({
      terminalSessions: [
        {
          terminalId: 'term-2',
          alive: true,
          socketCount: 1,
          opencodeSessionId: 'oc-99',
        },
      ],
      swarmProcesses: [
        {
          pid: 999,
          sessionId: 'oc-99',
          agent: 'coder',
        },
      ],
      agentRegistry: [],
      agentRuns: [],
      swarmMissions: [],
      crashDumps: [],
      logSignals: {
        quotaBlocked: true,
        quotaMatches: ['GoUsageLimitError: quota reached'],
      },
    });

    expect(snapshot.terminals[0].status).toBe(RUNTIME_STATUS.QUOTA_BLOCKED);
    expect(snapshot.processes[0].status).toBe(RUNTIME_STATUS.QUOTA_BLOCKED);
    expect(snapshot.anomalies.quotaBlocked).toBe(true);
  });

  it('detects quota signals from logs', () => {
    const signals = detectQuotaSignals({
      terminalLog: 'request failed with status 429',
      browserLog: 'GoUsageLimitError: too many requests',
      opencodeLog: '',
    });

    expect(signals.quotaBlocked).toBe(true);
    expect(signals.quotaMatches.length).toBeGreaterThan(0);
  });

  describe('diagnosis', () => {
    it('returns ALL_CLEAR when nothing is wrong', () => {
      const snapshot = createRuntimeDiagnosticsSnapshot({
        terminalSessions: [
          { terminalId: 't1', alive: true, socketCount: 1, opencodeSessionId: 'oc-1' },
        ],
        swarmProcesses: [{ pid: 100, sessionId: 'oc-1', agent: 'coder' }],
        agentRegistry: [{ agent_id: 'coder', status: 'running' }],
        agentRuns: [{ agent_id: 'coder', status: 'running' }],
        swarmMissions: [],
        crashDumps: [],
        logSignals: { quotaBlocked: false, quotaMatches: [] },
        errorLines: [],
      });

      expect(snapshot.diagnosis.findings).toHaveLength(1);
      expect(snapshot.diagnosis.findings[0].code).toBe('ALL_CLEAR');
      expect(snapshot.diagnosis.findings[0].severity).toBe('ok');
    });

    it('detects reattachable terminals in diagnosis', () => {
      const snapshot = createRuntimeDiagnosticsSnapshot({
        terminalSessions: [
          { terminalId: 't1', alive: true, socketCount: 0, opencodeSessionId: 'oc-1' },
        ],
        swarmProcesses: [],
        agentRegistry: [],
        agentRuns: [],
        swarmMissions: [],
        crashDumps: [],
        logSignals: { quotaBlocked: false, quotaMatches: [] },
        errorLines: [],
      });

      const reattachFinding = snapshot.diagnosis.findings.find(
        (f) => f.code === 'TERMINALS_REATTACHABLE'
      );
      expect(reattachFinding).toBeDefined();
      expect(reattachFinding.severity).toBe('warning');
      expect(snapshot.diagnosis.actions.length).toBeGreaterThan(0);
    });

    it('detects quota blocked in diagnosis', () => {
      const snapshot = createRuntimeDiagnosticsSnapshot({
        terminalSessions: [],
        swarmProcesses: [],
        agentRegistry: [],
        agentRuns: [],
        swarmMissions: [],
        crashDumps: [],
        logSignals: {
          quotaBlocked: true,
          quotaMatches: ['429 Too Many Requests'],
        },
        errorLines: [],
      });

      const quotaFinding = snapshot.diagnosis.findings.find((f) => f.code === 'QUOTA_BLOCKED');
      expect(quotaFinding).toBeDefined();
      expect(quotaFinding.severity).toBe('critical');
    });

    it('detects orphaned processes in diagnosis', () => {
      const snapshot = createRuntimeDiagnosticsSnapshot({
        terminalSessions: [],
        swarmProcesses: [{ pid: 555, sessionId: 'orphan-session', agent: 'ghost' }],
        agentRegistry: [],
        agentRuns: [],
        swarmMissions: [],
        crashDumps: [],
        logSignals: { quotaBlocked: false, quotaMatches: [] },
        errorLines: [],
      });

      const orphanFinding = snapshot.diagnosis.findings.find(
        (f) => f.code === 'ORPHANED_PROCESSES'
      );
      expect(orphanFinding).toBeDefined();
      expect(orphanFinding.severity).toBe('warning');
    });

    it('detects stale registry in diagnosis', () => {
      const snapshot = createRuntimeDiagnosticsSnapshot({
        terminalSessions: [],
        swarmProcesses: [],
        agentRegistry: [{ agent_id: 'stale-agent', status: 'idle' }],
        agentRuns: [{ agent_id: 'stale-agent', status: 'completed' }],
        swarmMissions: [],
        crashDumps: [],
        logSignals: { quotaBlocked: false, quotaMatches: [] },
        errorLines: [],
      });

      const staleFinding = snapshot.diagnosis.findings.find((f) => f.code === 'STALE_REGISTRY');
      expect(staleFinding).toBeDefined();
      expect(staleFinding.severity).toBe('warning');
    });

    it('detects blocked workspaces in diagnosis', () => {
      const snapshot = createRuntimeDiagnosticsSnapshot({
        terminalSessions: [],
        swarmProcesses: [],
        agentRegistry: [],
        agentRuns: [],
        swarmMissions: [],
        crashDumps: [],
        logSignals: { quotaBlocked: false, quotaMatches: [] },
        errorLines: [],
        agentWorkspaces: [
          { id: 'ws-1', agent_id: 'worker-1', status: 'conflicted', last_error: 'merge conflict' },
          { id: 'ws-2', agent_id: 'worker-2', status: 'orphaned', last_error: null },
        ],
      });

      const wsFinding = snapshot.diagnosis.findings.find((f) => f.code === 'BLOCKED_WORKSPACES');
      expect(wsFinding).toBeDefined();
      expect(wsFinding.detail).toHaveLength(2);
    });

    it('detects blocked supervisor snapshots in diagnosis', () => {
      const snapshot = createRuntimeDiagnosticsSnapshot({
        terminalSessions: [],
        swarmProcesses: [],
        agentRegistry: [],
        agentRuns: [],
        swarmMissions: [],
        crashDumps: [],
        logSignals: { quotaBlocked: false, quotaMatches: [] },
        errorLines: [],
        supervisorSnapshots: [
          {
            task_id: 'task-1',
            supervisor_state: 'awaiting_approval',
            reason_class: 'approval_required',
            task_retry_count: 0,
          },
          {
            task_id: 'task-2',
            supervisor_state: 'blocked',
            reason_class: 'blocked_dependency',
            task_retry_count: 2,
          },
        ],
      });

      const supFinding = snapshot.diagnosis.findings.find((f) => f.code === 'SUPERVISOR_BLOCKED');
      expect(supFinding).toBeDefined();
      expect(supFinding.detail).toHaveLength(2);
    });

    it('detects crash dumps in diagnosis', () => {
      const snapshot = createRuntimeDiagnosticsSnapshot({
        terminalSessions: [],
        swarmProcesses: [],
        agentRegistry: [],
        agentRuns: [],
        swarmMissions: [],
        crashDumps: [
          {
            file: 'crash-1.json',
            reason: 'pty_abnormal_exit',
            ts: '2026-05-23T00:00:00Z',
            pid: 1234,
          },
        ],
        logSignals: { quotaBlocked: false, quotaMatches: [] },
        errorLines: [],
      });

      const crashFinding = snapshot.diagnosis.findings.find((f) => f.code === 'CRASH_DUMPS');
      expect(crashFinding).toBeDefined();
      expect(crashFinding.detail).toHaveLength(1);
    });

    it('includes agentWorkspaces and supervisorSnapshots in snapshot output', () => {
      const workspaces = [{ id: 'ws-1', agent_id: 'w1', status: 'active' }];
      const supervisors = [{ task_id: 't-1', supervisor_state: 'lease_active' }];

      const snapshot = createRuntimeDiagnosticsSnapshot({
        terminalSessions: [],
        swarmProcesses: [],
        agentRegistry: [],
        agentRuns: [],
        swarmMissions: [],
        crashDumps: [],
        logSignals: { quotaBlocked: false, quotaMatches: [] },
        errorLines: [],
        agentWorkspaces: workspaces,
        supervisorSnapshots: supervisors,
      });

      expect(snapshot.agentWorkspaces).toEqual(workspaces);
      expect(snapshot.supervisorSnapshots).toEqual(supervisors);
    });
  });
});
