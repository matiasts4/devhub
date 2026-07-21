import { POST as handleHookPost } from '../agent-hook/route.js';
import { GET as handleInstallerGet, POST as handleInstallerPost } from '../agent-hooks/installer/route.js';
import { getOrInitSessions } from '@/lib/terminal/ttyServer';
import { AgentStateMachine } from '@/lib/terminal/agentTuiMetadata.shared';

describe('Next.js Terminal API Routes — Agent Hooks & Installer', () => {
  let sessions;
  let mockSession;

  beforeEach(() => {
    sessions = getOrInitSessions();
    sessions.clear();

    mockSession = {
      id: 'term-route-test',
      hookToken: 'valid-token-1234567890123456789012',
      agentStateMachine: new AgentStateMachine(),
      agentTuiState: 'idle',
      agentTuiStateAt: 0,
      hookState: null,
      sockets: new Set(),
    };
    sessions.set('term-route-test', mockSession);
  });

  describe('POST /api/terminal/agent-hook', () => {
    test('returns 204 for valid report and updates session state', async () => {
      const request = new Request('http://localhost:3000/api/terminal/agent-hook', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          terminalId: 'term-route-test',
          token: 'valid-token-1234567890123456789012',
          state: 'working',
          agent: 'kimi',
          event: 'UserPromptSubmit',
        }),
      });

      const response = await handleHookPost(request);
      expect(response.status).toBe(204);
      expect(mockSession.agentTuiState).toBe('running');
      expect(mockSession.hookState.state).toBe('running');
    });

    test('returns 400 for payload > 4KB', async () => {
      const largeData = 'x'.repeat(4500);
      const request = new Request('http://localhost:3000/api/terminal/agent-hook', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          terminalId: 'term-route-test',
          token: 'valid-token-1234567890123456789012',
          state: 'working',
          extra: largeData,
        }),
      });

      const response = await handleHookPost(request);
      expect(response.status).toBe(400);
      const json = await response.json();
      expect(json.error).toContain('4KB');
    });

    test('returns 403 for invalid token', async () => {
      const request = new Request('http://localhost:3000/api/terminal/agent-hook', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          terminalId: 'term-route-test',
          token: 'wrong-token',
          state: 'working',
        }),
      });

      const response = await handleHookPost(request);
      expect(response.status).toBe(403);
    });
  });

  describe('Installer Route Localhost Guard', () => {
    test('rejects non-localhost requests with 403', async () => {
      const request = new Request('http://external-host.com/api/terminal/agent-hooks/installer', {
        method: 'GET',
        headers: { host: 'external-host.com' },
      });

      const getRes = await handleInstallerGet(request);
      expect(getRes.status).toBe(403);

      const postRequest = new Request('http://external-host.com/api/terminal/agent-hooks/installer', {
        method: 'POST',
        headers: { host: 'external-host.com' },
        body: JSON.stringify({ agent: 'kimi', action: 'install' }),
      });

      const postRes = await handleInstallerPost(postRequest);
      expect(postRes.status).toBe(403);
    });
  });
});
