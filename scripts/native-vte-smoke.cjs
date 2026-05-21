#!/usr/bin/env node

const path = require('path');
const { buildTauriEnv } = require('./tauri-cli.cjs');
const { spawnSync } = require('child_process');
const fs = require('fs');

const SRC_TAURI_DIR = path.resolve(__dirname, '..', 'src-tauri');

function parseNativeVteSmokeArgs(args = []) {
  const flags = {};
  const passthrough = [];

  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i];
    const next = args[i + 1];
    if (arg === '--qa-run-id' && next) {
      flags.qaRunId = next;
      i += 1;
      continue;
    }
    if (arg === '--scenario' && next) {
      flags.scenarioId = next;
      i += 1;
      continue;
    }
    if (arg === '--summary-json' && next) {
      flags.summaryPath = next;
      i += 1;
      continue;
    }
    passthrough.push(arg);
  }

  return { qaContext: flags, passthroughArgs: passthrough };
}

function writeNativeVteSmokeSummary({
  fsImpl = fs,
  summaryPath,
  qaRunId = null,
  scenarioId = null,
  args = [],
  status,
}) {
  if (!summaryPath) return null;

  fsImpl.mkdirSync(path.dirname(summaryPath), { recursive: true });
  const summary = {
    qa_run_id: qaRunId,
    scenario_id: scenarioId,
    status,
    command: ['cargo', ...buildNativeVteSmokeArgs(args)].join(' '),
    summary_json: summaryPath,
  };
  fsImpl.writeFileSync(summaryPath, `${JSON.stringify(summary, null, 2)}\n`, 'utf8');
  return summary;
}

function buildNativeVteSmokeArgs(args = []) {
  return ['run', '--bin', 'gtk_vte_smoke', '--', ...args];
}

function runNativeVteSmoke({
  args = process.argv.slice(2),
  env = buildTauriEnv(),
  spawnSync: spawn = spawnSync,
  fs: fsImpl = fs,
  qaContext = null,
} = {}) {
  const parsed = qaContext ? { qaContext, passthroughArgs: args } : parseNativeVteSmokeArgs(args);
  const result = spawn('cargo', buildNativeVteSmokeArgs(parsed.passthroughArgs), {
    cwd: SRC_TAURI_DIR,
    env,
    stdio: 'inherit',
  });

  if (result.error) {
    throw result.error;
  }

  if (typeof result.status === 'number') {
    writeNativeVteSmokeSummary({
      fsImpl,
      summaryPath: parsed.qaContext.summaryPath,
      qaRunId: parsed.qaContext.qaRunId || null,
      scenarioId: parsed.qaContext.scenarioId || null,
      args: parsed.passthroughArgs,
      status: result.status === 0 ? 'passed' : 'failed',
    });
    process.exitCode = result.status;
    return result.status;
  }

  if (result.signal) {
    process.kill(process.pid, result.signal);
  }

  return 1;
}

if (require.main === module) {
  try {
    runNativeVteSmoke();
  } catch (error) {
    console.error(error?.message || String(error));
    process.exit(1);
  }
}

module.exports = {
  buildNativeVteSmokeArgs,
  parseNativeVteSmokeArgs,
  writeNativeVteSmokeSummary,
  runNativeVteSmoke,
  SRC_TAURI_DIR,
};
