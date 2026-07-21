import { buildSessionHookEnv, generateSessionHookToken } from '../agentHooks/hookEnv.js';
import { handleHookReport, ALLOWED_HOOK_STATES } from '../agentHooks/handleHookReport.js';
import {
  hasFreshHookAuthority,
  HOOK_AUTHORITY_TTL_MS,
  ingestAgentDetectionFromFilteredOutput,
  tickAgentDetection,
} from '../sessionAgentDetector.js';
import { AgentStateMachine } from '../agentTuiMetadata.shared.js';
import { createSession, getOrInitSessions } from '../ttyServer.js';

describe('Phase 0 — Agent Lifecycle Hooks Generic Channel & P0-P3 Fixes', () => {
  describe('hookEnv', () => {
    test('generateSessionHookToken produces 32-char hex string', () => {
      const token = generateSessionHookToken();
      expect(typeof token).toBe('string');
      expect(token).toMatch(/^[a-f0-9]{32}$/);
    });

    test('buildSessionHookEnv throws if hookUrl is missing (P3-5)', () => {
      const session = { id: 'term-test-123' };
      expect(() => buildSessionHookEnv({ session })).toThrow('hookUrl is required');
    });

    test('buildSessionHookEnv creates expected environment variables', () => {
      const session = { id: 'term-test-123' };
      const env = buildSessionHookEnv({ session, hookUrl: 'http://127.0.0.1:4000/agent-hook' });

      expect(env.DEVHUB_HOOK_ENV).toBe('1');
      expect(env.DEVHUB_TERMINAL_ID).toBe('term-test-123');
      expect(env.DEVHUB_HOOK_URL).toBe('http://127.0.0.1:4000/agent-hook');
      expect(env.DEVHUB_HOOK_TOKEN).toBe(session.hookToken);
      expect(session.hookToken).toMatch(/^[a-f0-9]{32}$/);
    });
  });

  describe('handleHookReport & State Authority', () => {
    let sessionsMap;
    let mockSession;

    beforeEach(() => {
      sessionsMap = new Map();
      mockSession = {
        id: 'term-1',
        agentType: 'kimi',
        hookToken: 'test-token-1234567890123456789012',
        agentStateMachine: new AgentStateMachine(),
        agentTuiState: 'idle',
        agentTuiStateAt: 0,
        hookState: null,
      };
      sessionsMap.set('term-1', mockSession);
    });

    test('returns 400 if body is invalid or missing required fields', () => {
      expect(handleHookReport(sessionsMap, null).status).toBe(400);
      expect(handleHookReport(sessionsMap, { terminalId: 'term-1' }).status).toBe(400);
      expect(
        handleHookReport(sessionsMap, {
          terminalId: 'term-1',
          token: 'test-token-1234567890123456789012',
          state: 'invalid-state',
        }).status
      ).toBe(400);
    });

    test('returns 404 if session is not found', () => {
      const res = handleHookReport(sessionsMap, {
        terminalId: 'non-existent',
        token: 'test-token-1234567890123456789012',
        state: 'working',
      });
      expect(res.status).toBe(404);
    });

    test('returns 403 if token does not match', () => {
      const res = handleHookReport(sessionsMap, {
        terminalId: 'term-1',
        token: 'wrong-token',
        state: 'working',
      });
      expect(res.status).toBe(403);
    });

    test('maps working -> running and updates session hookState & stateMachine', () => {
      const now = 100000;
      const res = handleHookReport(
        sessionsMap,
        {
          terminalId: 'term-1',
          token: 'test-token-1234567890123456789012',
          state: 'working',
          agent: 'kimi',
          event: 'UserPromptSubmit',
        },
        now
      );

      expect(res.status).toBe(204);
      expect(res.broadcast).toEqual({
        type: 'agent-state',
        agentTuiState: 'running',
        at: now,
      });
      expect(mockSession.agentTuiState).toBe('running');
      expect(mockSession.agentType).toBe('kimi');
      expect(mockSession.hookState).toEqual({
        state: 'running',
        rawState: 'working',
        event: 'UserPromptSubmit',
        at: now,
        source: 'devhub:kimi',
        agentSessionId: null,
      });
    });

    test('broadcast is null when state is unchanged (P2-2)', () => {
      mockSession.agentTuiState = 'running';
      mockSession.agentStateMachine.state = 'running';

      const now = 100000;
      // First report publishes running
      handleHookReport(
        sessionsMap,
        {
          terminalId: 'term-1',
          token: 'test-token-1234567890123456789012',
          state: 'working',
          agent: 'kimi',
          event: 'UserPromptSubmit',
        },
        now
      );

      // Second identical report -> broadcast is null
      const secondRes = handleHookReport(
        sessionsMap,
        {
          terminalId: 'term-1',
          token: 'test-token-1234567890123456789012',
          state: 'working',
          agent: 'kimi',
          event: 'PreToolUse',
        },
        now + 100
      );

      expect(secondRes.status).toBe(204);
      expect(secondRes.broadcast).toBeNull();
    });

    test('handles Stop -> idle immediately without anti-flicker hold', () => {
      mockSession.agentTuiState = 'running';
      mockSession.agentStateMachine.state = 'running';

      const now = 200000;
      const res = handleHookReport(
        sessionsMap,
        {
          terminalId: 'term-1',
          token: 'test-token-1234567890123456789012',
          state: 'idle',
          agent: 'kimi',
          event: 'Stop',
        },
        now
      );

      expect(res.status).toBe(204);
      expect(mockSession.agentTuiState).toBe('idle');
      expect(mockSession.agentStateMachine.state).toBe('idle');
    });

    test('handles state=session without setting hookState authority (P2-1)', () => {
      mockSession.agentTuiState = 'idle';

      const res = handleHookReport(
        sessionsMap,
        {
          terminalId: 'term-1',
          token: 'test-token-1234567890123456789012',
          state: 'session',
          agentSessionId: 'sess-abc-123',
        },
        300000
      );

      expect(res.status).toBe(204);
      expect(mockSession.agentSessionId).toBe('sess-abc-123');
      expect(mockSession.hookState).toBeNull();
      expect(hasFreshHookAuthority(mockSession, 300000)).toBe(false);
    });
  });

  describe('hasFreshHookAuthority & Authority Gating', () => {
    test('hasFreshHookAuthority evaluates TTL and agent allowlist correctly (P3-2)', () => {
      const session = {
        agentType: 'kimi',
        hookState: { at: 1000, source: 'devhub:kimi' },
      };
      expect(hasFreshHookAuthority(session, 1000 + 5000)).toBe(true);
      expect(hasFreshHookAuthority(session, 1000 + HOOK_AUTHORITY_TTL_MS + 1)).toBe(false);

      // Agent not in allowlist (e.g. grok) returns false
      const grokSession = {
        agentType: 'grok',
        hookState: { at: 1000, source: 'devhub:grok' },
      };
      expect(hasFreshHookAuthority(grokSession, 1000 + 5000)).toBe(false);
    });

    test('ingestAgentDetectionFromFilteredOutput yields to fresh hook authority', () => {
      const session = {
        agentType: 'kimi',
        agentStateMachine: new AgentStateMachine(),
        hookState: { at: 5000, state: 'running', source: 'devhub:kimi' },
        agentTuiState: 'running',
        detectionBuffer: '',
      };

      const res = ingestAgentDetectionFromFilteredOutput(session, 'Esc to interrupt', 6000);
      expect(res.published).toBeNull();
    });

    test('tickAgentDetection prioritizes PTY death check before hook authority (P3-1)', () => {
      const session = {
        agentType: 'kimi',
        agentStateMachine: new AgentStateMachine(),
        hookState: { at: 5000, state: 'running', source: 'devhub:kimi' },
        agentTuiState: 'running',
        pty: null, // Dead PTY
        ptyPid: null,
      };

      const res = tickAgentDetection(session, 6000);
      expect(res.published).not.toBeNull();
      expect(res.published.state).toBe('idle');
      expect(session.hookState).toBeNull();
    });
  });

  describe('P0-1 Fix Verification — Token Consistency', () => {
    test('createSession token matches hookToken on session object', () => {
      const sessions = getOrInitSessions();
      sessions.clear();

      const session = createSession({ id: 'term-p01-test', shell: 'cmd.exe' });
      expect(session.hookToken).toBeDefined();
      expect(session.hookToken).toMatch(/^[a-f0-9]{32}$/);

      // Verify that handleHookReport accepts this exact token
      const reportRes = handleHookReport(sessions, {
        terminalId: session.id,
        token: session.hookToken,
        state: 'working',
        agent: 'kimi',
      });

      expect(reportRes.status).toBe(204);
      expect(session.agentTuiState).toBe('running');

      // Cleanup
      try {
        session.pty?.kill();
      } catch {}
      sessions.delete(session.id);
    });
  });
});
