/**
 * @jest-environment node
 */

const {
  recordZedServerMetric,
  getZedServerMetricsSummary,
  resetZedServerMetrics,
} = require('../zedServerMetrics');

describe('zedServerMetrics', () => {
  beforeEach(() => {
    resetZedServerMetrics();
  });

  test('tracks fast path hits and misses', () => {
    recordZedServerMetric({ type: 'fast_path_hit', durationMs: 12 });
    recordZedServerMetric({ type: 'fast_path_hit', durationMs: 20 });
    recordZedServerMetric({ type: 'fast_path_miss' });

    const summary = getZedServerMetricsSummary();
    expect(summary.fastPath).toEqual({
      hits: 2,
      misses: 1,
      total: 3,
      hitRate: 67,
    });
  });

  test('tracks LLM calls and latency buckets', () => {
    recordZedServerMetric({ type: 'llm_call', durationMs: 100, estimatedTokensIn: 400 });
    recordZedServerMetric({ type: 'llm_call', durationMs: 1500, estimatedTokensOut: 200 });
    recordZedServerMetric({ type: 'llm_error' });

    const summary = getZedServerMetricsSummary();
    expect(summary.llm.calls).toBe(2);
    expect(summary.llm.errors).toBe(1);
    expect(summary.llm.avgLatencyMs).toBe(800);
    expect(summary.llm.latencyBuckets.counts).toEqual([1, 0, 0, 1, 0]);
    expect(summary.llm.estimatedTokensIn).toBe(400);
    expect(summary.llm.estimatedTokensOut).toBe(200);
  });

  test('ignores unknown metric types', () => {
    recordZedServerMetric({ type: 'unknown' });
    const summary = getZedServerMetricsSummary();
    expect(summary.fastPath.total).toBe(0);
    expect(summary.llm.calls).toBe(0);
  });

  test('clamps invalid values', () => {
    recordZedServerMetric({ type: 'llm_call', durationMs: -10, estimatedTokensIn: NaN });
    const summary = getZedServerMetricsSummary();
    expect(summary.llm.avgLatencyMs).toBe(0);
    expect(summary.llm.estimatedTokensIn).toBe(0);
  });
});
