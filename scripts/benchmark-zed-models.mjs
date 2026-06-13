#!/usr/bin/env node
/**
 * Wrapper — runs live benchmark via Jest (uses project babel + @ aliases).
 */
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const env = {
  ...process.env,
  ZED_BENCHMARK: '1',
  ZED_BENCHMARK_RUNS: process.env.ZED_BENCHMARK_RUNS || '1',
};

const result = spawnSync(
  'pnpm',
  [
    'exec',
    'jest',
    'src/lib/asistente/__tests__/zedLatencyBenchmark.live.test.js',
    '--runInBand',
    '--testTimeout=180000',
  ],
  { cwd: root, env, stdio: 'inherit' }
);

process.exit(result.status ?? 1);
