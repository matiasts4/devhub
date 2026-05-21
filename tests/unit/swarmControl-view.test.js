const {
  deriveSwarmControlHealthModel,
  deriveSwarmHeaderModel,
} = require('../../src/lib/operations/swarmControl');

function renderSwarmControlSummary({ snapshot, swarmConfig, activeAgentsCount }) {
  const health = deriveSwarmControlHealthModel(snapshot);
  const header = deriveSwarmHeaderModel({ snapshot, swarmConfig, activeAgentsCount });

  return {
    healthCards: (snapshot.sources || []).map((source) => `${source.label}:${source.status}`),
    processLabel: header.processLabel,
    processReason: header.processReason,
    queueLength: health.queue?.length || 0,
    concurrency: `${header.concurrency.current}/${header.concurrency.max}`,
  };
}

describe('SwarmControl canonical surface semantics', () => {
  test('prefers canonical health sources over duplicated legacy process indicators', () => {
    const view = renderSwarmControlSummary({
      snapshot: {
        sources: [
          {
            key: 'opencode-process',
            label: 'OpenCode Process',
            status: 'healthy',
            authority: 'authoritative',
            metrics: { pid: 321, memory_rss: 1024 },
          },
          {
            key: 'queue',
            label: 'Swarm Queue',
            status: 'healthy',
            authority: 'authoritative',
            metrics: { length: 3, active_agents: 2 },
          },
          {
            key: 'session-stream',
            label: 'Session Stream',
            status: 'degraded',
            authority: 'authoritative',
          },
        ],
      },
      swarmConfig: { max_concurrent_swarms: 5 },
      activeAgentsCount: 2,
    });

    expect(view.healthCards).toEqual(
      expect.arrayContaining(['OpenCode Process:healthy', 'Session Stream:degraded'])
    );
    expect(view.processLabel).toBe('Server OK');
    expect(view.queueLength).toBe(3);
    expect(view.concurrency).toBe('2/5');
  });

  test('surfaces degraded stream semantics without defaulting missing health to healthy', () => {
    const view = renderSwarmControlSummary({
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
          {
            key: 'session-stream',
            label: 'Session Stream',
            status: 'degraded',
            authority: 'authoritative',
          },
        ],
      },
      swarmConfig: { max_concurrent_swarms: 4 },
      activeAgentsCount: 0,
    });

    expect(view.processLabel).toBe('Server degradado');
    expect(view.processReason).toBe('Live check unavailable.');
    expect(view.healthCards).toContain('Session Stream:degraded');
    expect(view.concurrency).toBe('0/4');
  });
});
