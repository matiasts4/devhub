/**
 * Lightweight in-process server-side metrics for Zed.
 *
 * These counters are intentionally ephemeral (process lifetime) and are meant
 * for local observability / smoke tests. They are not a replacement for a
 * proper metrics backend.
 */

const LATENCY_BUCKETS = [250, 500, 1000, 2000];

const state = {
  fastPathHits: 0,
  fastPathMisses: 0,
  llmCalls: 0,
  llmErrors: 0,
  totalLatencyMs: 0,
  latencyBuckets: [0, 0, 0, 0, 0], // <250, <500, <1000, <2000, >=2000
  estimatedTokensIn: 0,
  estimatedTokensOut: 0,
};

function bucketIndex(ms) {
  for (let i = 0; i < LATENCY_BUCKETS.length; i++) {
    if (ms < LATENCY_BUCKETS[i]) return i;
  }
  return LATENCY_BUCKETS.length;
}

function clamp(n, min, max) {
  if (Number.isNaN(n)) return min;
  if (n < min) return min;
  if (n > max) return max;
  return n;
}

/**
 * Record a server-side Zed event.
 *
 * @param {object} params
 * @param {'fast_path_hit'|'fast_path_miss'|'llm_call'|'llm_error'} params.type
 * @param {number} [params.durationMs]
 * @param {number} [params.estimatedTokensIn]
 * @param {number} [params.estimatedTokensOut]
 */
export function recordZedServerMetric({
  type,
  durationMs = 0,
  estimatedTokensIn = 0,
  estimatedTokensOut = 0,
}) {
  const duration = clamp(Number(durationMs), 0, 300000);
  const tokensIn = clamp(Number(estimatedTokensIn), 0, 1000000);
  const tokensOut = clamp(Number(estimatedTokensOut), 0, 1000000);

  switch (type) {
    case 'fast_path_hit':
      state.fastPathHits += 1;
      break;
    case 'fast_path_miss':
      state.fastPathMisses += 1;
      break;
    case 'llm_call':
      state.llmCalls += 1;
      state.totalLatencyMs += duration;
      state.latencyBuckets[bucketIndex(duration)] += 1;
      state.estimatedTokensIn += tokensIn;
      state.estimatedTokensOut += tokensOut;
      break;
    case 'llm_error':
      state.llmErrors += 1;
      break;
    default:
      // Unknown metric type — ignore silently.
      break;
  }
}

/**
 * @returns {object}
 */
export function getZedServerMetricsSummary() {
  const totalCalls = state.llmCalls;
  return {
    fastPath: {
      hits: state.fastPathHits,
      misses: state.fastPathMisses,
      total: state.fastPathHits + state.fastPathMisses,
      hitRate:
        state.fastPathHits + state.fastPathMisses > 0
          ? Math.round((state.fastPathHits / (state.fastPathHits + state.fastPathMisses)) * 100)
          : 0,
    },
    llm: {
      calls: state.llmCalls,
      errors: state.llmErrors,
      avgLatencyMs: totalCalls > 0 ? Math.round(state.totalLatencyMs / totalCalls) : 0,
      latencyBuckets: {
        labels: ['<250ms', '<500ms', '<1000ms', '<2000ms', '>=2000ms'],
        counts: [...state.latencyBuckets],
      },
      estimatedTokensIn: state.estimatedTokensIn,
      estimatedTokensOut: state.estimatedTokensOut,
    },
  };
}

/**
 * Reset all counters. Useful in tests.
 */
export function resetZedServerMetrics() {
  state.fastPathHits = 0;
  state.fastPathMisses = 0;
  state.llmCalls = 0;
  state.llmErrors = 0;
  state.totalLatencyMs = 0;
  state.latencyBuckets = [0, 0, 0, 0, 0];
  state.estimatedTokensIn = 0;
  state.estimatedTokensOut = 0;
}

export { LATENCY_BUCKETS };
