'use strict';

/**
 * Local router latency benchmark (no live LLM).
 * Run: ZED_BENCHMARK=1 pnpm benchmark:zed-models
 */
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
];

function median(nums) {
  const sorted = [...nums].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

const runs = Number(process.env.ZED_BENCHMARK_RUNS || 1);

describe('zedLatencyBenchmark (local router)', () => {
  if (!process.env.ZED_BENCHMARK) {
    test.skip('set ZED_BENCHMARK=1 to run latency benchmark', () => {});
    return;
  }

  test('resolveZedIntent median < 5ms per phrase', () => {
    const samples = [];

    for (let r = 0; r < runs; r += 1) {
      for (const phrase of PHRASES) {
        const t0 = performance.now();
        resolveZedIntent(phrase, CTX);
        samples.push(performance.now() - t0);
      }
    }

    const med = median(samples);
    const max = Math.max(...samples);

    console.log(
      `zed router latency: median=${med.toFixed(3)}ms max=${max.toFixed(3)}ms n=${samples.length}`
    );

    expect(med).toBeLessThan(5);
  });
});
