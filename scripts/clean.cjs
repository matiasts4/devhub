#!/usr/bin/env node
/**
 * Disk cleanup for DevHub — reclaims space from build caches and artifacts.
 * Usage: node scripts/clean.cjs [--all]
 *   default: cleans regenerable caches (safe, ~20GB)
 *   --all: also removes node_modules and .next (full reset, ~25GB)
 */
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const ROOT = path.join(__dirname, '..');
const full = process.argv.includes('--all');

function dirSize(dir) {
  if (!fs.existsSync(dir)) return 0;
  try {
    const out = process.platform === 'win32'
      ? execFileSync('powershell', ['-NoProfile', '-Command',
          `(Get-ChildItem '${dir}' -Recurse -Force -EA SilentlyContinue | Measure-Object Length -Sum).Sum`
        ], { encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] })
      : execFileSync('du', ['-sb', dir], { encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] });
    return parseInt(out.trim(), 10) || 0;
  } catch {
    return 0;
  }
}

function rm(dir, label) {
  const target = path.join(ROOT, dir);
  if (!fs.existsSync(target)) return;
  const mb = (dirSize(target) / 1048576).toFixed(0);
  fs.rmSync(target, { recursive: true, force: true });
  console.log(`  ✓ ${label || dir} — ${mb} MB freed`);
}

console.log('[clean] DevHub disk cleanup\n');

console.log('Rust build cache:');
rm('src-tauri/target/debug', 'src-tauri/target/debug');
if (full) {
  rm('src-tauri/target/release', 'src-tauri/target/release');
}

console.log('\nBuild artifacts:');
rm('dist', 'dist (electron-builder)');
rm('.next/cache', '.next/cache');
if (full) {
  rm('.next', '.next (full)');
}

console.log('\nDev runtime:');
rm('.devhub/worktrees', '.devhub/worktrees');

if (full) {
  console.log('\nFull reset:');
  rm('node_modules', 'node_modules');
}

console.log('\n[clean] Done. Run `pnpm install` to restore dependencies.');
if (!full) {
  console.log('[clean] Tip: use --all for a full reset (also removes node_modules + .next).');
}
