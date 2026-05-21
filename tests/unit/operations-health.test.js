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

  test('maps MCP control-center snapshots into degraded health when inventory is only configured', () => {
    const source = buildMcpHealthSource(
      {
        authority: 'durable',
        observed_at: '2026-04-10T17:15:00.000Z',
        doctor: {
          probes: [
            { key: 'database', status: 'healthy', authority: 'durable', freshness: 'current' },
            { key: 'inventory', status: 'degraded', authority: 'configured', freshness: 'unknown' },
          ],
        },
        list_tools: {
          tools: [
            { name: 'list_projects', authority: 'durable', control_plane: true, safe_action: true },
            { name: 'read_file', authority: 'configured', control_plane: false, safe_action: false },
          ],
        },
        smoke: {
          status: 'degraded',
        },
      },
      { now: '2026-04-10T17:20:00.000Z' }
    );

    expect(source).toMatchObject({
      key: 'mcp',
      status: 'degraded',
      authority: 'authoritative',
    });
    expect(source.status_reason.toLowerCase()).toContain('degraded');
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
          authority: 'durable',
          observed_at: '2026-04-10T17:19:00.000Z',
          doctor: {
            probes: [
              { key: 'database', status: 'healthy', authority: 'durable', freshness: 'current' },
              { key: 'inventory', status: 'degraded', authority: 'configured', freshness: 'unknown' },
            ],
          },
          list_tools: {
            tools: [
              { name: 'list_projects', authority: 'durable', control_plane: true, safe_action: true },
              { name: 'read_file', authority: 'configured', control_plane: false, safe_action: false },
            ],
          },
          smoke: { status: 'degraded' },
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
      degraded: 2,
      stale: 0,
      worst_status: 'degraded',
    });
    expect(snapshot.sources.map((source) => source.key)).toEqual([
      'opencode-process',
      'session-stream',
      'mcp',
      'telegram',
    ]);
  });
});
