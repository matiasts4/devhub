#!/usr/bin/env node

const fs = require('fs');
const os = require('os');
const path = require('path');
const { dirSizeBytes } = require('./clean-workspace-disk.cjs');

const ROOT = path.join(__dirname, '..');

function driveLetter(targetPath) {
  if (!targetPath) return null;
  const root = path.parse(path.resolve(targetPath)).root;
  return root ? root.replace(/\\$/, '') : null;
}

function envPath(name, fallback) {
  return process.env[name] || fallback;
}

function probe(label, targetPath, { optional = false } = {}) {
  const exists = Boolean(targetPath && fs.existsSync(targetPath));
  const bytes = exists ? dirSizeBytes(targetPath) : 0;
  const row = {
    label,
    path: targetPath || null,
    drive: driveLetter(targetPath),
    exists,
    sizeMb: Math.round((bytes / (1024 * 1024)) * 10) / 10,
    essential: !optional,
  };
  return row;
}

function main() {
  const home = os.homedir();
  const rows = [
    probe('repo', ROOT),
    probe('cargo target (devhub)', path.join(ROOT, 'src-tauri', 'target')),
    probe('next build output', path.join(ROOT, '.next')),
    probe('standalone zip', path.join(ROOT, 'src-tauri', 'resources', 'standalone.zip')),
    probe('node_modules (repo)', path.join(ROOT, 'node_modules')),
    probe('pnpm store', envPath('PNPM_STORE_PATH', 'D:\\.pnpm-store\\v10'), { optional: true }),
    probe('CARGO_HOME (registry cache)', path.join(home, '.cargo')),
    probe('RUSTUP_HOME (toolchains)', path.join(home, '.rustup')),
    probe('npm cache', path.join(home, 'AppData', 'Local', 'npm-cache')),
    probe('TEMP/TMP (build temps)', process.env.TEMP || path.join(home, 'AppData', 'Local', 'Temp')),
    probe('DEVHUB_HOME runtime (~/.devhub)', path.join(home, '.devhub')),
    probe('DEVHUB dev runtime (~/.devhub-dev)', path.join(home, '.devhub-dev')),
    probe('Installed app (NSIS)', path.join(home, 'AppData', 'Local', 'DevHub'), {
      optional: true,
    }),
    probe('Installed app data', path.join(home, 'AppData', 'Local', 'com.devhub.desktop'), {
      optional: true,
    }),
  ];

  const onC = rows.filter((row) => row.exists && row.drive && row.drive.toUpperCase().startsWith('C:'));
  const onD = rows.filter((row) => row.exists && row.drive && row.drive.toUpperCase().startsWith('D:'));

  console.log('[audit:locations] DevHub build/runtime map\n');
  for (const row of rows) {
    if (!row.path) continue;
    const size = row.exists ? `${row.sizeMb} MB` : 'missing';
    console.log(
      `- ${row.label}: ${row.path} [${row.drive || '?'}] ${size}`
    );
  }

  const cBytes = onC.reduce((sum, row) => sum + row.sizeMb, 0);
  const dBytes = onD.reduce((sum, row) => sum + row.sizeMb, 0);
  console.log(`\n[audit:locations] Tracked on C: ~${Math.round(cBytes)} MB`);
  console.log(`[audit:locations] Tracked on D: ~${Math.round(dBytes)} MB`);
  console.log(
    '\n[audit:locations] Builds del repo (target, .next, zip) deben estar en D: si el clone está en D:\\devhub.'
  );
  console.log(
    '[audit:locations] En C: revisar TEMP, ~/.cargo, ~/.rustup, ~/.devhub y la app instalada en AppData\\Local.'
  );
}

if (require.main === module) {
  main();
}

module.exports = { main, probe, driveLetter };