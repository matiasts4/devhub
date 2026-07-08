#!/usr/bin/env node

const { spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const {
  computeStandaloneBuildFingerprint,
  shouldSkipStandaloneProductionBuild,
  writeStoredFingerprint,
  STANDALONE_ZIP,
} = require('./build-input-fingerprint.cjs');

function run(command, args, label) {
  const result = spawnSync(command, args, {
    cwd: ROOT,
    stdio: 'inherit',
    shell: process.platform === 'win32',
    env: process.env,
  });

  if (result.status !== 0) {
    throw new Error(`${label} failed with exit code ${result.status ?? 'unknown'}`);
  }
}

function readBuildId() {
  try {
    return fs.readFileSync(path.join(ROOT, '.next', 'BUILD_ID'), 'utf8').trim();
  } catch (_error) {
    return null;
  }
}

function main() {
  const force = process.argv.includes('--force');
  const decision = shouldSkipStandaloneProductionBuild({ force });

  if (decision.skip) {
    console.log(
      `[build:cache] Skipping next build + standalone.zip (${decision.reason}, digest=${decision.current.digest.slice(0, 12)}…)`
    );
    console.log(`[build:cache] Reusing ${STANDALONE_ZIP}`);
    return;
  }

  console.log(`[build:cache] Running full production frontend build (${decision.reason})`);

  run(process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm', ['exec', 'next', 'build'], 'next build');
  run(process.execPath, [path.join(__dirname, 'build-standalone-zip.cjs')], 'standalone zip');

  const fingerprint = computeStandaloneBuildFingerprint();
  const zipStat = fs.statSync(STANDALONE_ZIP);
  writeStoredFingerprint(fingerprint, {
    buildId: readBuildId(),
    standaloneZipBytes: zipStat.size,
    standaloneZipMtimeMs: zipStat.mtimeMs,
  });

  console.log(
    `[build:cache] Updated fingerprint (${fingerprint.fileCount} inputs, digest=${fingerprint.digest.slice(0, 12)}…)`
  );
}

if (require.main === module) {
  try {
    main();
  } catch (error) {
    console.error(error?.message || String(error));
    process.exit(1);
  }
}

module.exports = { main };