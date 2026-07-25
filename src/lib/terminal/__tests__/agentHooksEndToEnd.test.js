import { createSession, getOrInitSessions } from '../ttyServer.js';
import { handleHookReport } from '../agentHooks/handleHookReport.js';
import { buildSidecarSpawnConfig } from '../../../../sidecar-backend/sessionSpawn.js';
import {
  hasFreshHookAuthority,
  ingestAgentDetectionFromFilteredOutput,
  tickAgentDetection,
} from '../sessionAgentDetector.js';
import { AgentStateMachine } from '../agentTuiMetadata.shared.js';

describe('Agent Hooks End-To-End Happy Path (Both Transports)', () => {
  let sessions;

  beforeEach(() => {
    sessions = getOrInitSessions();
    sessions.clear();
  });

  test('Transport 1: ttyServer / Next route — token match, POST working, screen silenced, POST idle without hold', () => {
    const session = createSession({ id: 'term-e2e-ttyserver', shell: 'cmd.exe' });
    const token = session.hookToken;

    expect(token).toBeDefined();
    expect(token).toMatch(/^[a-f0-9]{32}$/);

    // 1. Send working report
    const now1 = 100000;
    const workingRes = handleHookReport(
      sessions,
      {
        terminalId: session.id,
        token: token,
        state: 'working',
        agent: 'kimi',
        event: 'UserPromptSubmit',
      },
      now1
    );

    expect(workingRes.status).toBe(204);
    expect(session.agentTuiState).toBe('running');
    expect(session.hookState).toEqual(
      expect.objectContaining({
        state: 'running',
        rawState: 'working',
        event: 'UserPromptSubmit',
        at: now1,
      })
    );

    // 2. Screen detection silenced by fresh hook authority
    const screenRes = ingestAgentDetectionFromFilteredOutput(
      session,
      'Esc to interrupt (thinking)',
      now1 + 5000
    );
    expect(screenRes.published).toBeNull();

    const tickRes = tickAgentDetection(session, now1 + 10000);
    expect(tickRes.published).toBeNull();

    // 3. Send idle report -> publishes idle immediately without hold
    const now2 = now1 + 15000;
    const idleRes = handleHookReport(
      sessions,
      {
        terminalId: session.id,
        token: token,
        state: 'idle',
        agent: 'kimi',
        event: 'Stop',
      },
      now2
    );

    expect(idleRes.status).toBe(204);
    expect(session.agentTuiState).toBe('idle');
    expect(session.agentStateMachine.state).toBe('idle');

    // Cleanup
    try {
      session.pty?.kill();
    } catch {
      /* pty already dead */
    }
    sessions.delete(session.id);
  });

  test('Transport 2: sidecar — buildSidecarSpawnConfig token matches session token, state flow works', () => {
    const sidecarSessions = new Map();
    const token = 'sidecar-token-1234567890123456789012';

    const spawnConfig = buildSidecarSpawnConfig({
      sessionId: 'term-e2e-sidecar',
      cwd: process.cwd(),
      env: { SIDECAR_PORT: '4000' },
      hookToken: token,
      hookUrl: 'http://127.0.0.1:4000/agent-hook',
    });

    expect(spawnConfig.env.DEVHUB_HOOK_TOKEN).toBe(token);
    expect(spawnConfig.env.DEVHUB_HOOK_URL).toBe('http://127.0.0.1:4000/agent-hook');

    const sidecarSession = {
      id: 'term-e2e-sidecar',
      hookToken: token,
      agentType: 'claude',
      agentStateMachine: new AgentStateMachine(),
      agentTuiState: 'idle',
      agentTuiStateAt: 0,
      hookState: null,
      clients: new Set(),
    };
    sidecarSessions.set('term-e2e-sidecar', sidecarSession);

    // POST working -> 204
    const workingRes = handleHookReport(sidecarSessions, {
      terminalId: 'term-e2e-sidecar',
      token: token,
      state: 'working',
      agent: 'claude',
      event: 'PreToolUse',
    });

    expect(workingRes.status).toBe(204);
    expect(sidecarSession.agentTuiState).toBe('running');
    expect(hasFreshHookAuthority(sidecarSession, Date.now())).toBe(true);

    // POST idle -> 204
    const idleRes = handleHookReport(sidecarSessions, {
      terminalId: 'term-e2e-sidecar',
      token: token,
      state: 'idle',
      agent: 'claude',
      event: 'Stop',
    });

    expect(idleRes.status).toBe(204);
    expect(sidecarSession.agentTuiState).toBe('idle');
  });
});
