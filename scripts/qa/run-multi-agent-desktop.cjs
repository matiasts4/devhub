#!/usr/bin/env node

/**
 * Linux-first desktop QA harness.
 *
 * Verification checkpoint:
 * - Command: npm run qa:multi-agent-desktop -- --qa-run-id <id> --scenario <approval-closure|recovery>
 * - Bundle layout: test-results/desktop-qa/<qa_run_id>/{browser,native,headless,manifest.json}
 * - Triage: inspect manifest.incomplete first, then surface-specific browser/native/headless outputs.
 */

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

function parseArgs(argv = process.argv.slice(2)) {
  const flags = {};
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    const next = argv[i + 1];
    if (arg.startsWith('--') && next && !next.startsWith('--')) {
      flags[arg.slice(2)] = next;
      i += 1;
    } else if (arg.startsWith('--')) {
      flags[arg.slice(2)] = true;
    }
  }
  return flags;
}

function normalizeDurableRefs(input = {}) {
  return {
    approvals: Array.isArray(input.approvals) ? [...new Set(input.approvals.filter(Boolean))] : [],
    runs: Array.isArray(input.runs) ? [...new Set(input.runs.filter(Boolean))] : [],
    workspaces: Array.isArray(input.workspaces) ? [...new Set(input.workspaces.filter(Boolean))] : [],
    recovery: Array.isArray(input.recovery) ? [...new Set(input.recovery.filter(Boolean))] : [],
  };
}

function appendQaRunId(ref, qaRunId) {
  if (!ref) return null;
  if (!qaRunId) return ref;
  return ref.includes('#') ? ref : `${ref}#${qaRunId}`;
}

function collectEvidenceByKind(items = [], kind, mapper) {
  return items
    .filter((item) => item?.kind === kind && item?.evidence_ref)
    .map(mapper)
    .filter(Boolean);
}

async function collectHealthDurableRefs({
  baseUrl,
  qaRunId,
  fetchImpl = fetch,
}) {
  const response = await fetchImpl(`${String(baseUrl).replace(/\/$/, '')}/api/agenthub/operations/health`, {
    cache: 'no-store',
  });

  if (!response.ok) {
    throw new Error(`Health route failed with ${response.status}`);
  }

  const payload = await response.json();
  const snapshot = payload?.control_room_snapshot_input || {};
  const approvals = Array.isArray(snapshot?.supervisor?.approvals) ? snapshot.supervisor.approvals : [];
  const timeline = Array.isArray(snapshot?.evidence_timeline) ? snapshot.evidence_timeline : [];

  return normalizeDurableRefs({
    approvals: approvals.map((approval) => appendQaRunId(approval?.evidence_ref, qaRunId)),
    runs: collectEvidenceByKind(timeline, 'run', (item) => appendQaRunId(item.evidence_ref, qaRunId)),
    workspaces: collectEvidenceByKind(timeline, 'artifact', (item) => {
      if (!item?.linked_ids?.workspace_id) return null;
      if (!item.evidence_ref || !item.evidence_ref.includes('workspace')) return null;
      return appendQaRunId(item.evidence_ref, qaRunId);
    }),
    recovery: collectEvidenceByKind(timeline, 'artifact', (item) => {
      if (!item.evidence_ref || !item.evidence_ref.includes('recovery')) return null;
      return appendQaRunId(item.evidence_ref, qaRunId);
    }),
  });
}

function buildIncomplete(manifest) {
  const incomplete = [];

  for (const [surface, surfaceResult] of Object.entries(manifest.surfaces || {})) {
    if (!surfaceResult?.status) {
      incomplete.push(`surfaces.${surface}`);
    }
  }

  for (const [key, refs] of Object.entries(manifest.durable_refs || {})) {
    if (!Array.isArray(refs) || refs.length === 0) {
      incomplete.push(`durable_refs.${key}`);
    }
  }

  return incomplete;
}

function buildManifest({
  qaRunId,
  scenarioId,
  platform = 'linux',
  bundleRoot,
  surfaces = {},
  durableRefs = {},
}) {
  const manifest = {
    qa_run_id: qaRunId,
    scenario_id: scenarioId,
    platform,
    bundle_root: bundleRoot,
    surfaces,
    durable_refs: normalizeDurableRefs(durableRefs),
  };
  manifest.incomplete = buildIncomplete(manifest);
  return manifest;
}

function writeManifest({ manifest, fs: fsImpl = fs }) {
  const manifestPath = path.join(manifest.bundle_root, 'manifest.json');
  fsImpl.mkdirSync(path.dirname(manifestPath), { recursive: true });
  fsImpl.writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
  return manifestPath;
}

function runCommand({ command, args, env = process.env, cwd = process.cwd(), spawn = spawnSync }) {
  const result = spawn(command, args, { cwd, env, stdio: 'inherit' });
  return {
    status: result.status === 0 ? 'passed' : 'failed',
    exit_code: typeof result.status === 'number' ? result.status : 1,
    signal: result.signal || null,
  };
}

async function main() {
  const flags = parseArgs();
  const qaRunId = flags['qa-run-id'] || `qa-${Date.now()}`;
  const scenarioId = flags.scenario || 'approval-closure';
  const baseUrl = flags['base-url'] || process.env.BASE_URL || 'http://127.0.0.1:3100';
  const bundleRoot = path.resolve(
    process.cwd(),
    'test-results',
    'desktop-qa',
    qaRunId
  );
  const browserRoot = path.join(bundleRoot, 'browser');
  const nativeSummaryPath = path.join(bundleRoot, 'native', 'summary.json');
  const headlessReportPath = path.join(bundleRoot, 'headless', 'report.json');

  const browser = runCommand({
    command: process.platform === 'win32' ? 'npm.cmd' : 'npm',
    args: ['run', 'test:e2e', '--', 'tests/e2e/04_swarm_control.spec.ts'],
    env: {
      ...process.env,
      QA_RUN_ID: qaRunId,
      SCENARIO_ID: scenarioId,
      BASE_URL: baseUrl,
    },
  });

  const native = runCommand({
    command: process.platform === 'win32' ? 'node.exe' : 'node',
    args: [
      'scripts/native-vte-smoke.cjs',
      '--qa-run-id',
      qaRunId,
      '--scenario',
      scenarioId,
      '--summary-json',
      nativeSummaryPath,
    ],
  });

  const headless = runCommand({
    command: process.platform === 'win32' ? 'node.exe' : 'node',
    args: [
      'bin/agenthub-smoke.js',
      '--qa-run-id',
      qaRunId,
      '--scenario',
      scenarioId,
    ],
  });

  const durableRefs = await collectHealthDurableRefs({ baseUrl, qaRunId });

  const manifest = buildManifest({
    qaRunId,
    scenarioId,
    bundleRoot,
    surfaces: {
      browser: {
        status: browser.status,
        results_json: path.join(browserRoot, 'results.json'),
        html_report: path.join(browserRoot, 'playwright-report'),
        exit_code: browser.exit_code,
      },
      native: {
        status: native.status,
        summary_json: nativeSummaryPath,
        exit_code: native.exit_code,
      },
      headless: {
        status: headless.status,
        report_json: headlessReportPath,
        exit_code: headless.exit_code,
      },
    },
    durableRefs,
  });

  const manifestPath = writeManifest({ manifest });
  process.stdout.write(`${JSON.stringify({ manifest_path: manifestPath, qa_run_id: qaRunId }, null, 2)}\n`);
  process.exit(manifest.incomplete.length > 0 ? 2 : 0);
}

module.exports = {
  appendQaRunId,
  buildManifest,
  buildIncomplete,
  collectHealthDurableRefs,
  normalizeDurableRefs,
  parseArgs,
  runCommand,
  writeManifest,
};

if (require.main === module) {
  main().catch((error) => {
    console.error(error?.stack || error?.message || String(error));
    process.exit(1);
  });
}
