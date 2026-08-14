/**
 * Per-request timing harness for the Zed assistant chat route.
 *
 * Records wall-clock durations for each phase of a request so real latency
 * bottlenecks can be identified instead of guessed. Emission is cheap and
 * always on via zedLog; a JSON snapshot is written to
 * `data/logs/zed-perf/latest.json` when `ZED_PERF=1`.
 */

import fs from 'node:fs';
import path from 'node:path';
import { zedLog } from './utils/zed-logger';

const PERF_DIR = path.join(process.cwd(), 'data', 'logs', 'zed-perf');
const PERF_FILE = path.join(PERF_DIR, 'latest.json');

function isPerfDumpEnabled() {
  return process.env.ZED_PERF === '1' || process.env.ZED_PERF === 'true';
}

/**
 * @param {string} msgId request/message identifier for correlation
 * @returns {{ mark: (phase: string) => void, summary: () => object, flush: () => void }}
 */
export function createZedPerf(msgId) {
  const start = Date.now();
  let last = start;
  const phases = {};

  function mark(phase) {
    const now = Date.now();
    phases[phase] = (phases[phase] || 0) + (now - last);
    last = now;
  }

  function summary() {
    return {
      msgId,
      totalMs: Date.now() - start,
      phases: { ...phases },
      at: new Date().toISOString(),
    };
  }

  function flush() {
    const snap = summary();
    try {
      zedLog.orchestration('perf', snap);
    } catch {
      // Logging must never break a request.
    }
    if (isPerfDumpEnabled()) {
      try {
        fs.mkdirSync(PERF_DIR, { recursive: true });
        fs.writeFileSync(PERF_FILE, JSON.stringify(snap, null, 2), 'utf8');
      } catch {
        // Best-effort snapshot.
      }
    }
    return snap;
  }

  return { mark, summary, flush };
}

export default createZedPerf;
