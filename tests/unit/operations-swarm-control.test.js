const {
  buildControlRoomSnapshotInputFromHealth,
  deriveSwarmControlHealthModel,
  deriveSwarmHeaderModel,
  getSourceByKey,
} = require('../../src/lib/operations/swarmControl');

describe('operations swarm control model', () => {
  test('prefers canonical process and queue sources over duplicated legacy KPIs', () => {
    const model = deriveSwarmControlHealthModel({
      summary: { total: 5, worst_status: 'stale' },
      sources: [
        {
          key: 'opencode-process',
          label: 'OpenCode Process',
          status: 'healthy',
          authority: 'authoritative',
          metrics: { pid: 321, port: 4154, memory_rss: 268435456 },
        },
        {
          key: 'queue',
          label: 'Swarm Queue',
          status: 'healthy',
          authority: 'authoritative',
          metrics: { length: 3, estimated_wait_ms: 2000, active_agents: 2 },
        },
      ],
    });

    expect(model.process).toMatchObject({ status: 'healthy', pid: 321, port: 4154 });
    expect(model.queue).toMatchObject({ length: 3, active_agents: 2 });
    expect(model.summary.worst_status).toBe('stale');
  });

  test('returns null when a requested source is missing', () => {
    expect(getSourceByKey({ sources: [] }, 'mcp')).toBe(null);
  });

  test('derives a canonical header model from aggregated health and config', () => {
    const model = deriveSwarmHeaderModel({
      snapshot: {
        sources: [
          {
            key: 'opencode-process',
            label: 'OpenCode Process',
            status: 'healthy',
            authority: 'authoritative',
            metrics: { pid: 321 },
          },
          {
            key: 'queue',
            label: 'Swarm Queue',
            status: 'healthy',
            authority: 'authoritative',
            metrics: { length: 3, active_agents: 2 },
          },
        ],
      },
      swarmConfig: { max_concurrent_swarms: 5 },
      activeAgentsCount: 4,
    });

    expect(model.processLabel).toBe('Server OK');
    expect(model.processTone).toBe('success');
    expect(model.concurrency.current).toBe(4);
    expect(model.concurrency.max).toBe(5);
    expect(model.queue.length).toBe(3);
  });

  test('degrades the header model when the canonical process source is stale or missing', () => {
    const stale = deriveSwarmHeaderModel({
      snapshot: {
        sources: [
          {
            key: 'opencode-process',
            label: 'OpenCode Process',
            status: 'stale',
            authority: 'cached',
            status_reason: 'Live check unavailable.',
            metrics: {},
          },
        ],
      },
      swarmConfig: null,
      activeAgentsCount: 0,
    });

    expect(stale.processLabel).toBe('Server degradado');
    expect(stale.processTone).toBe('warning');
    expect(stale.processReason).toBe('Live check unavailable.');
    expect(stale.concurrency.max).toBe(0);

    const missing = deriveSwarmHeaderModel({
      snapshot: { sources: [] },
      swarmConfig: null,
      activeAgentsCount: 0,
    });

    expect(missing.processLabel).toBe('Server sin datos');
    expect(missing.processTone).toBe('muted');
  });

  test('maps operational health sources into a control-room compatibility payload', () => {
    const input = buildControlRoomSnapshotInputFromHealth({
      summary: { total: 5, worst_status: 'stale' },
      sources: [
        {
          key: 'opencode-process',
          status: 'healthy',
          authority: 'authoritative',
          freshness_ms: 0,
        },
        {
          key: 'mcp',
          status: 'stale',
          authority: 'inferred',
          freshness_ms: 120000,
        },
        {
          key: 'telegram',
          status: 'degraded',
          authority: 'authoritative',
          freshness_ms: 45000,
        },
        {
          key: 'session-stream',
          status: 'healthy',
          authority: 'authoritative',
          freshness_ms: 500,
        },
        {
          key: 'queue',
          status: 'healthy',
          authority: 'authoritative',
          freshness_ms: 0,
        },
      ],
    });

    expect(input).toEqual({
      diagnostics: {
        process: expect.objectContaining({ key: 'opencode-process', status: 'healthy' }),
        mcp: expect.objectContaining({ key: 'mcp', status: 'stale' }),
        telegram: expect.objectContaining({ key: 'telegram', status: 'degraded' }),
        session_stream: expect.objectContaining({ key: 'session-stream', status: 'healthy' }),
      },
    });
  });

  test('returns null when health snapshot has no control-room compatible diagnostics', () => {
    expect(
      buildControlRoomSnapshotInputFromHealth({
        sources: [{ key: 'queue', status: 'healthy', authority: 'authoritative' }],
      })
    ).toBe(null);
  });
});
