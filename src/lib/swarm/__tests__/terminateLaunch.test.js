jest.mock('@/lib/swarm/cleanup', () => ({
  cleanupMissionWorktrees: jest.fn(() => ({
    launch_id: 'launch-1',
    workspaces_processed: 1,
    results: [{ workspace_id: 'ws-1', success: true }],
  })),
}));

const { terminateSwarmLaunch } = require('../terminateLaunch');
const { cleanupMissionWorktrees } = require('../cleanup');

describe('terminateSwarmLaunch', () => {
  test('terminates one launch only and updates mission records', async () => {
    const sessionUpdates = [];
    const closeTerminalSessionById = jest.fn().mockResolvedValue({ success: true });
    const fetchImpl = jest.fn().mockResolvedValue({
      ok: true,
      text: async () => '',
    });
    const killTmuxSession = jest.fn().mockResolvedValue();

    const dbState = {
      mission: { mission_id: 'launch-1', status: 'active' },
      participants: [
        { participant_id: 'part-1', agent_id: 'launch-1-director' },
        { participant_id: 'part-2', agent_id: 'launch-1-coder' },
      ],
      workspaces: [
        {
          id: 'ws-1',
          agent_id: 'launch-1-director',
          terminal_id: 'p-dir',
          run_id_or_session_id: 'launch-1-director-session',
          repo_root: '/repo',
        },
        {
          id: 'ws-2',
          agent_id: 'launch-1-coder',
          terminal_id: 'p-coder',
          run_id_or_session_id: 'launch-1-coder-session',
          repo_root: '/repo',
        },
      ],
      runs: [
        {
          run_id: 'run-1',
          workspace_id: 'ws-1',
          run_id_or_session_id: 'launch-1-director-session',
        },
        { run_id: 'run-2', workspace_id: 'ws-2', run_id_or_session_id: 'launch-1-coder-session' },
      ],
      sessions: [
        {
          id: 'launch-1-director-session',
          opencode_session_id: 'oc-dir',
        },
        {
          id: 'launch-1-coder-session',
          opencode_session_id: 'oc-coder',
        },
      ],
      runUpdates: [],
      workspaceUpdates: [],
      participantUpdates: [],
      missionUpdate: null,
      presenceUpdates: [],
    };

    const db = {
      prepare(sql) {
        if (sql.includes('FROM swarm_missions')) {
          return { get: () => dbState.mission };
        }
        if (sql.includes('FROM mission_participants')) {
          return { all: () => dbState.participants };
        }
        if (sql.includes('FROM agent_workspaces')) {
          return { all: () => dbState.workspaces };
        }
        if (sql.includes('FROM agent_runs')) {
          return { all: () => dbState.runs };
        }
        if (sql.includes('FROM agent_hub_sessions')) {
          return { all: () => dbState.sessions };
        }
        if (sql.includes('UPDATE agent_runs')) {
          return {
            run: (...args) => {
              dbState.runUpdates.push(args);
              return { changes: 1 };
            },
          };
        }
        if (sql.includes('UPDATE agent_workspaces')) {
          return {
            run: (...args) => {
              dbState.workspaceUpdates.push(args);
              return { changes: 1 };
            },
          };
        }
        if (sql.includes('UPDATE mission_participants')) {
          return {
            run: (...args) => {
              dbState.participantUpdates.push(args);
              return { changes: 1 };
            },
          };
        }
        if (sql.includes('UPDATE swarm_missions')) {
          return {
            run: (...args) => {
              dbState.missionUpdate = args;
              return { changes: 1 };
            },
          };
        }
        if (sql.includes('UPDATE agent_presence')) {
          return {
            run: (...args) => {
              dbState.presenceUpdates.push(args);
              return { changes: 1 };
            },
          };
        }

        throw new Error(`Unexpected SQL: ${sql}`);
      },
    };

    const result = await terminateSwarmLaunch('launch-1', {
      db,
      fetchImpl,
      closeTerminalSessionImpl: closeTerminalSessionById,
      killTmuxSessionImpl: killTmuxSession,
      cleanupMissionWorktreesImpl: cleanupMissionWorktrees,
      updateSessionStatusImpl: (...args) => {
        if (args.length === 2) {
          sessionUpdates.push({ sessionId: args[0], status: args[1] });
          return;
        }
        sessionUpdates.push({ sessionId: args[1], status: args[2] });
      },
      opencodeUrl: 'http://127.0.0.1:4154',
    });

    expect(closeTerminalSessionById).toHaveBeenCalledTimes(2);
    expect(closeTerminalSessionById).toHaveBeenNthCalledWith(1, 'p-dir');
    expect(closeTerminalSessionById).toHaveBeenNthCalledWith(2, 'p-coder');
    expect(fetchImpl).toHaveBeenCalledTimes(2);
    expect(fetchImpl).toHaveBeenCalledWith('http://127.0.0.1:4154/session/oc-dir/abort', {
      method: 'POST',
    });
    expect(fetchImpl).toHaveBeenCalledWith('http://127.0.0.1:4154/session/oc-coder/abort', {
      method: 'POST',
    });
    expect(killTmuxSession).toHaveBeenCalledWith('devhub-swarm-launch-1-director');
    expect(killTmuxSession).toHaveBeenCalledWith('devhub-swarm-launch-1-coder');
    expect(cleanupMissionWorktrees).toHaveBeenCalledWith(
      { repoRoot: '/repo', launchId: 'launch-1' },
      { force: true }
    );
    expect(sessionUpdates).toEqual([
      { sessionId: 'launch-1-director-session', status: 'aborted' },
      { sessionId: 'launch-1-coder-session', status: 'aborted' },
    ]);
    expect(dbState.runUpdates).toHaveLength(2);
    expect(dbState.workspaceUpdates).toHaveLength(2);
    expect(dbState.participantUpdates).toHaveLength(2);
    expect(dbState.missionUpdate).toEqual([
      'Launch terminated from workspace controls.',
      expect.any(String),
      expect.any(String),
      'launch-1',
    ]);
    expect(result.terminated).toBe(true);
    expect(result.launchId).toBe('launch-1');
  });

  test('merges client panel/opencode hints and discovers tmux sessions by prefix', async () => {
    const closeTerminalSessionById = jest.fn().mockResolvedValue({ success: true });
    const fetchImpl = jest.fn().mockResolvedValue({ ok: true, text: async () => '' });
    const killTmuxSession = jest.fn().mockResolvedValue();
    const listTmuxSessionsByPrefix = jest
      .fn()
      .mockResolvedValue(['devhub-swarm-launch-1-researcher']);

    const dbState = {
      mission: { mission_id: 'launch-1', status: 'active' },
      participants: [{ participant_id: 'part-1', agent_id: 'launch-1-director' }],
      workspaces: [
        {
          id: 'ws-1',
          agent_id: 'launch-1-director',
          terminal_id: null,
          pane_id: null,
          run_id_or_session_id: 'launch-1-director-session',
          repo_root: '/repo',
        },
      ],
      runs: [
        {
          run_id: 'run-1',
          workspace_id: 'ws-1',
          run_id_or_session_id: 'launch-1-director-session',
        },
      ],
      sessions: [{ id: 'launch-1-director-session', opencode_session_id: null }],
    };

    const db = {
      prepare(sql) {
        if (sql.includes('FROM swarm_missions')) return { get: () => dbState.mission };
        if (sql.includes('FROM mission_participants')) return { all: () => dbState.participants };
        if (sql.includes('FROM agent_workspaces')) return { all: () => dbState.workspaces };
        if (sql.includes('FROM agent_runs')) return { all: () => dbState.runs };
        if (sql.includes('FROM agent_hub_sessions')) return { all: () => dbState.sessions };
        if (sql.includes('UPDATE agent_runs')) return { run: () => ({ changes: 1 }) };
        if (sql.includes('UPDATE agent_workspaces')) return { run: () => ({ changes: 1 }) };
        if (sql.includes('UPDATE mission_participants')) return { run: () => ({ changes: 1 }) };
        if (sql.includes('UPDATE swarm_missions')) return { run: () => ({ changes: 1 }) };
        if (sql.includes('UPDATE agent_presence')) return { run: () => ({ changes: 1 }) };
        throw new Error(`Unexpected SQL: ${sql}`);
      },
    };

    const result = await terminateSwarmLaunch('launch-1', {
      db,
      fetchImpl,
      closeTerminalSessionImpl: closeTerminalSessionById,
      killTmuxSessionImpl: killTmuxSession,
      listTmuxSessionsByPrefixImpl: listTmuxSessionsByPrefix,
      cleanupMissionWorktreesImpl: cleanupMissionWorktrees,
      updateSessionStatusImpl: jest.fn(),
      panelIds: ['p-extra'],
      opencodeSessionIds: ['oc-extra'],
    });

    expect(closeTerminalSessionById).toHaveBeenCalledWith('p-extra');
    expect(fetchImpl).toHaveBeenCalledWith('http://127.0.0.1:4154/session/oc-extra/abort', {
      method: 'POST',
    });
    expect(listTmuxSessionsByPrefix).toHaveBeenCalledWith('devhub-swarm-launch-1-');
    expect(killTmuxSession).toHaveBeenCalledWith('devhub-swarm-launch-1-director');
    expect(killTmuxSession).toHaveBeenCalledWith('devhub-swarm-launch-1-researcher');
    expect(result.terminals.attempted).toContain('p-extra');
    expect(result.opencodeSessions.attempted).toContain('oc-extra');
  });
});
