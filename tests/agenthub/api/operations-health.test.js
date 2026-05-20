jest.mock('next/server', () => ({
  NextResponse: {
    json(body, init = {}) {
      return {
        status: init.status ?? 200,
        json: async () => body,
      };
    },
  },
}));

describe('GET /api/agenthub/operations/health', () => {
  test('aggregates one canonical health snapshot from mixed operational sources', async () => {
    const {
      gatherOperationalHealth,
    } = require('../../../src/app/api/agenthub/operations/health/route');

    const snapshot = await gatherOperationalHealth({
      now: '2026-04-10T17:25:00.000Z',
      getProcessStatus: async () => ({
        running: true,
        healthy: true,
        pid: 321,
        port: 4154,
        processInfo: { uptime: 30000, memoryMB: 128 },
      }),
      getQueueStatus: () => ({ length: 2, items: [{ estimatedWaitMs: 5000 }] }),
      getActiveAgentCount: () => 2,
      getMcpStatus: async () => ({
        servers: [{ name: 'filesystem', status: 'connected', tools: [{ name: 'read_file' }] }],
        note: 'MCP status is cached. OpenCode headless does not expose live MCP server info.',
      }),
      getSessionsHealth: async () => ({
        active_sessions: [{ session_id: 'active-1' }],
        stale_sessions: [{ session_id: 'stale-1' }],
        aborted_count: 1,
        live_check_available: true,
        checked_at: '2026-04-10T17:24:00.000Z',
      }),
      getTelegramStatus: async () => ({
        bot_connected: true,
        active_chats: 3,
        recent_errors: 0,
        last_activity: '2026-04-10T17:24:40.000Z',
      }),
      getMissionSnapshot: async () => ({
        mission: {
          mission_id: 'mission-1',
          title: 'Misión Director',
          status: 'active',
        },
        participants: [{ agent_id: 'agent-director', role_in_mission: 'director' }],
        latest_message: {
          message_id: 'message-1',
          body_summary: 'Tomá la ejecución del workspace principal',
        },
        pending_deliveries: [{ delivery_id: 'delivery-1', status: 'retry_pending' }],
        presence: {
          active: [{ agent_id: 'agent-director' }],
          stale: [],
          offline: [],
        },
      }),
    });

    expect(snapshot.summary).toMatchObject({
      total: 5,
      healthy: 3,
      degraded: 1,
      stale: 1,
      worst_status: 'stale',
    });

    expect(snapshot.sources).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ key: 'opencode-process', authority: 'authoritative' }),
        expect.objectContaining({ key: 'queue', metrics: expect.objectContaining({ length: 2 }) }),
        expect.objectContaining({ key: 'mcp', authority: 'inferred', status: 'stale' }),
      ])
    );

    expect(snapshot.control_room_snapshot_input).toEqual({
      diagnostics: {
        process: expect.objectContaining({ key: 'opencode-process', status: 'healthy' }),
        mcp: expect.objectContaining({ key: 'mcp', status: 'stale' }),
        telegram: expect.objectContaining({ key: 'telegram', status: 'healthy' }),
        session_stream: expect.objectContaining({ key: 'session-stream', status: 'degraded' }),
      },
      mission_control: expect.objectContaining({
        mission: expect.objectContaining({ mission_id: 'mission-1', title: 'Misión Director' }),
        pending_deliveries: [expect.objectContaining({ status: 'retry_pending' })],
      }),
    });
  });

  test('explicitly degrades missing process health instead of defaulting to healthy', async () => {
    const {
      gatherOperationalHealth,
    } = require('../../../src/app/api/agenthub/operations/health/route');

    const snapshot = await gatherOperationalHealth({
      now: '2026-04-10T17:25:00.000Z',
      getProcessStatus: async () => ({ running: false, healthy: false, pid: null, port: 4154 }),
      getQueueStatus: () => ({ length: 0, items: [] }),
      getActiveAgentCount: () => 0,
      getMcpStatus: async () => ({ servers: [], note: 'MCP status is cached.' }),
      getSessionsHealth: async () => ({
        active_sessions: [],
        stale_sessions: [],
        aborted_count: 0,
        live_check_available: false,
        checked_at: '2026-04-10T17:10:00.000Z',
      }),
      getTelegramStatus: async () => ({
        bot_connected: false,
        active_chats: 0,
        recent_errors: 2,
        last_activity: null,
      }),
    });

    const processSource = snapshot.sources.find((source) => source.key === 'opencode-process');
    const sessionSource = snapshot.sources.find((source) => source.key === 'session-stream');

    expect(processSource).toMatchObject({ status: 'offline', authority: 'authoritative' });
    expect(sessionSource).toMatchObject({ status: 'stale', authority: 'cached' });
    expect(snapshot.summary.worst_status).toBe('offline');
    expect(snapshot.control_room_snapshot_input).toEqual({
      diagnostics: {
        process: expect.objectContaining({ key: 'opencode-process', status: 'offline' }),
        mcp: expect.objectContaining({ key: 'mcp', status: 'stale' }),
        telegram: expect.objectContaining({ key: 'telegram', status: 'degraded' }),
        session_stream: expect.objectContaining({ key: 'session-stream', status: 'stale' }),
      },
    });
  });
});
