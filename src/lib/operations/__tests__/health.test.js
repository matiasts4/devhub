const {
  buildRuntimeDiagnosticsHealthSource,
} = require('../health');

describe('buildRuntimeDiagnosticsHealthSource', () => {
  test('returns degraded when quota-blocked anomaly is present', () => {
    const source = buildRuntimeDiagnosticsHealthSource({
      generatedAt: '2026-05-23T18:00:00.000Z',
      evidence_refs: ['log://terminal-debug.log:data/logs/terminal-debug.log'],
      summary: {
        totalTerminals: 2,
        totalProcesses: 2,
        totalRegistryAgents: 2,
      },
      anomalies: {
        quotaBlocked: true,
        reattachableTerminals: [],
        orphanedProcesses: [],
        staleRegistryAgents: [],
      },
    });

    expect(source.key).toBe('runtime-diagnostics');
    expect(source.status).toBe('degraded');
    expect(source.metrics.quota_blocked).toBe(true);
    expect(source.evidence_refs).toEqual([
      'log://terminal-debug.log:data/logs/terminal-debug.log',
    ]);
  });

  test('returns degraded when only reattachable terminals are present', () => {
    const source = buildRuntimeDiagnosticsHealthSource({
      generatedAt: '2026-05-23T18:00:00.000Z',
      summary: {
        totalTerminals: 1,
        totalProcesses: 1,
        totalRegistryAgents: 1,
      },
      anomalies: {
        quotaBlocked: false,
        reattachableTerminals: ['term-1'],
        orphanedProcesses: [],
        staleRegistryAgents: [],
      },
    });

    expect(source.status).toBe('degraded');
    expect(source.metrics.reattachable_terminals).toBe(1);
  });

  test('returns stale inferred source when diagnostics payload has error', () => {
    const source = buildRuntimeDiagnosticsHealthSource({
      error: 'boom',
    });

    expect(source.status).toBe('stale');
    expect(source.authority).toBe('inferred');
    expect(source.status_reason).toContain('boom');
  });
});
