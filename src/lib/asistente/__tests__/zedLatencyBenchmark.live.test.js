'use strict';

/**
 * Local router latency benchmark (no live LLM).
 * Run: ZED_BENCHMARK=1 node ./node_modules/jest/bin/jest.js src/lib/asistente/__tests__/zedLatencyBenchmark.live.test.js --runInBand
 */
const { performance } = require('perf_hooks');
const { resolveZedIntent } = require('../zedIntentRouter');

const CTX = {
  workspace_terminals: [
    { terminalId: 'p1', displayName: 'Chase' },
    { terminalId: 'p2', displayName: 'Cesar' },
  ],
  terminal_panel_count: 2,
};

const PHRASES = [
  '¿Qué terminales hay?',
  'abrí github.com en pizarra',
  'run npm test',
  'ejecuta npm test',
  'cierra la terminal',
  'explicame useEffect',
  'crea una tarea para refactorizar el router',
  'delegá las tareas 14 y 15 a OpenCode',
];

function percentile(sorted, p) {
  const index = Math.ceil((p / 100) * sorted.length) - 1;
  return sorted[Math.max(0, index)];
}

function stats(nums) {
  const sorted = [...nums].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  const median = sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
  return {
    n: nums.length,
    median,
    p50: percentile(sorted, 50),
    p95: percentile(sorted, 95),
    p99: percentile(sorted, 99),
    max: sorted[sorted.length - 1],
  };
}

const runs = Number(process.env.ZED_BENCHMARK_RUNS || 1000);
const medianThresholdMs = Number(process.env.ZED_BENCHMARK_THRESHOLD_MS || 5);

describe('zedLatencyBenchmark (local router)', () => {
  if (!process.env.ZED_BENCHMARK) {
    test.skip('set ZED_BENCHMARK=1 to run latency benchmark', () => {});
    return;
  }

  test(`resolveZedIntent median < ${medianThresholdMs}ms per phrase`, () => {
    const samples = [];

    for (let r = 0; r < runs; r += 1) {
      for (const phrase of PHRASES) {
        const t0 = performance.now();
        resolveZedIntent(phrase, CTX);
        samples.push(performance.now() - t0);
      }
    }

    const s = stats(samples);

    console.log(
      `zed router latency: median=${s.median.toFixed(3)}ms p95=${s.p95.toFixed(3)}ms p99=${s.p99.toFixed(3)}ms max=${s.max.toFixed(3)}ms n=${s.n}`
    );

    expect(s.median).toBeLessThan(medianThresholdMs);
  });
});
