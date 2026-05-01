const {
  buildHealthSnapshot,
  buildMcpHealthSource,
  buildProcessHealthSource,
  buildSessionStreamHealthSource,
  buildTelegramHealthSource,
} = require('../../src/lib/operations/health');

describe('operations health mappers', () => {
  test('builds an authoritative healthy process source from live process status', () => {
    const source = buildProcessHealthSource(
      {
        running: true,
        healthy: true,
        pid: 123,
        port: 4154,
        uptime: 120000,
      },
      { now: '2026-04-10T17:20:00.000Z' }
    );

    expect(source).toMatchObject({
      key: 'opencode-process',
      status: 'healthy',
      authority: 'authoritative',
      metrics: expect.objectContaining({ pid: 123, port: 4154 }),
    });
  });

  test('degrades session stream health when live session checks are unavailable', () => {
    const source = buildSessionStreamHealthSource(
      {
        live_check_available: false,
        active_sessions: [],
        stale_sessions: [],
        checked_at: '2026-04-10T17:15:00.000Z',
      },
      { now: '2026-04-10T17:20:00.000Z' }
    );

    expect(source.status).toBe('stale');
    expect(source.authority).toBe('cached');
    expect(source.status_reason).toContain('Live session check unavailable');
  });

  test('marks cached MCP status as inferred and stale even when legacy status says connected', () => {
    const source = buildMcpHealthSource(
      {
        servers: [{ name: 'filesystem', status: 'connected', tools: [{ name: 'read_file' }] }],
        note: 'MCP status is cached. OpenCode headless does not expose live MCP server info.',
      },
      { now: '2026-04-10T17:20:00.000Z' }
    );

    expect(source).toMatchObject({
      key: 'mcp',
      status: 'stale',
      authority: 'inferred',
    });
    expect(source.status_reason).toContain('cached');
  });

  test('summarizes mixed source health into one health snapshot', () => {
    const snapshot = buildHealthSnapshot({
      generated_at: '2026-04-10T17:20:00.000Z',
      sources: [
        buildProcessHealthSource({ running: true, healthy: true, pid: 42, port: 4154 }),
        buildSessionStreamHealthSource({
          live_check_available: true,
          active_sessions: [{ session_id: 'a' }],
          stale_sessions: [{ session_id: 'b' }],
          checked_at: '2026-04-10T17:19:00.000Z',
        }),
        buildMcpHealthSource({
          servers: [{ name: 'filesystem', status: 'connected', tools: [{ name: 'read_file' }] }],
          note: 'MCP status is cached.',
        }),
        buildTelegramHealthSource({
          bot_connected: true,
          active_chats: 2,
          recent_errors: 0,
          last_activity: '2026-04-10T17:19:30.000Z',
        }),
      ],
    });

    expect(snapshot.summary).toMatchObject({
      total: 4,
      healthy: 2,
      degraded: 1,
      stale: 1,
      worst_status: 'stale',
    });
    expect(snapshot.sources.map((source) => source.key)).toEqual([
      'opencode-process',
      'session-stream',
      'mcp',
      'telegram',
    ]);
  });
});
