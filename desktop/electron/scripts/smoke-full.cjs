'use strict';

/**
 * Full Electron host structural smoke (E0–E4 hardening).
 * Checks critical files, package.json scripts, and channels exports.
 * Does NOT launch Electron or drive UI automation.
 *
 * Exit 0 if all critical checks pass.
 * Exit 1 with missing list otherwise.
 *
 * Usage:
 *   node desktop/electron/scripts/smoke-full.cjs
 *   npm run electron:smoke
 */

const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..', '..', '..');
const electronRoot = path.join(root, 'desktop', 'electron');

/** @type {string[]} */
const missing = [];
/** @type {string[]} */
const warnings = [];

function exists(rel) {
  return fs.existsSync(path.join(root, rel));
}

function requireCritical(rel, label = rel) {
  if (!exists(rel)) {
    missing.push(label);
    console.log(`[FAIL] missing: ${label}`);
    return false;
  }
  console.log(`[PASS] ${label}`);
  return true;
}

function requireWarn(rel, label = rel) {
  if (!exists(rel)) {
    warnings.push(label);
    console.log(`[WARN] missing (non-critical): ${label}`);
    return false;
  }
  console.log(`[PASS] ${label}`);
  return true;
}

function main() {
  console.log('DevHub Electron structural smoke (smoke-full)\n');
  console.log(`repo root: ${root}\n`);

  // --- Critical host files (E0) ---
  console.log('--- Host scaffold ---');
  const criticalFiles = [
    'desktop/electron/main.js',
    'desktop/electron/window.js',
    'desktop/electron/preload.js',
    'desktop/electron/sidecar.js',
    'desktop/electron/channels.js',
    'desktop/electron/browser/bounds.js',
    'desktop/electron/browser/ipc.js',
    'desktop/electron/browser/registry.js',
    'src/lib/desktop/desktopRuntime.js',
    'src/lib/desktop/desktopBridge.js',
  ];
  for (const f of criticalFiles) {
    requireCritical(f);
  }

  // --- E1–E3 modules (warn if missing; do not fail smoke-full core) ---
  console.log('\n--- Shell / packaging / overlays (E1–E3) ---');
  const extendedFiles = [
    'desktop/electron/tray.js',
    'desktop/electron/ipc/index.js',
    'desktop/electron/ipc/shell.js',
    'desktop/electron/packaging/runtime.js',
    'desktop/electron/electron-builder.yml',
    'desktop/electron/browser/avoidRects.js',
    'desktop/electron/voice.js',
    'desktop/electron/multiWindow.js',
    'desktop/electron/scripts/smoke-e1.cjs',
  ];
  for (const f of extendedFiles) {
    requireWarn(f);
  }

  // --- Docs / hardening artifacts (E4) ---
  console.log('\n--- Hardening artifacts ---');
  requireCritical('docs/electron-desktop-host.md');
  requireCritical('openspec/changes/electron-desktop-host/cutover-checklist.md');
  requireCritical('openspec/changes/electron-desktop-host/qa-matrix.md');
  requireCritical('desktop/electron/scripts/smoke-e0.cjs');
  requireCritical('desktop/electron/scripts/smoke-full.cjs');
  requireWarn('desktop/electron/scripts/regression-checklist.md');
  requireWarn('desktop/electron/README.md');
  requireWarn('openspec/changes/electron-desktop-host/verify-report.md');
  requireWarn('openspec/changes/electron-desktop-host/apply-progress.md');

  // --- package.json scripts ---
  console.log('\n--- package.json scripts ---');
  const pkgPath = path.join(root, 'package.json');
  let pkg = null;
  if (!fs.existsSync(pkgPath)) {
    missing.push('package.json');
    console.log('[FAIL] missing: package.json');
  } else {
    try {
      pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
    } catch (err) {
      missing.push('package.json (parse error)');
      console.log('[FAIL] package.json parse error:', err.message);
    }
  }

  if (pkg) {
    const scripts = pkg.scripts || {};
    const requiredScripts = ['electron:dev', 'electron:start'];
    for (const name of requiredScripts) {
      if (scripts[name]) {
        console.log(`[PASS] script ${name} = ${scripts[name]}`);
      } else {
        missing.push(`package.json scripts.${name}`);
        console.log(`[FAIL] missing script: ${name}`);
      }
    }

    // Prefer electron:smoke; accept electron:smoke-e0 as partial
    if (scripts['electron:smoke']) {
      console.log(`[PASS] script electron:smoke = ${scripts['electron:smoke']}`);
    } else if (scripts['electron:smoke-e0']) {
      warnings.push('package.json scripts.electron:smoke (using electron:smoke-e0 only)');
      console.log('[WARN] electron:smoke not defined — electron:smoke-e0 present');
    } else {
      missing.push('package.json scripts.electron:smoke (or electron:smoke-e0)');
      console.log('[FAIL] missing electron:smoke and electron:smoke-e0');
    }

    // Dual-shell: Tauri must still exist for rollback
    if (scripts['tauri:dev'] || scripts.tauri) {
      console.log('[PASS] Tauri scripts still present (dual-shell rollback)');
    } else {
      warnings.push('Tauri scripts absent — dual-shell rollback path unclear');
      console.log('[WARN] no tauri:dev / tauri script');
    }

    const electronDep =
      (pkg.devDependencies && pkg.devDependencies.electron) ||
      (pkg.dependencies && pkg.dependencies.electron);
    if (electronDep) {
      console.log(`[PASS] electron dependency: ${electronDep}`);
    } else {
      warnings.push('electron not in package.json dependencies/devDependencies');
      console.log('[WARN] electron package not listed in package.json');
    }

    // electron-builder not required until E1 packaging
    if (scripts['electron:build'] || pkg.build) {
      console.log('[PASS] packaging config/script present');
    } else {
      warnings.push('no electron-builder / electron:build yet (E1.2 expected)');
      console.log('[WARN] no electron-builder config (expected until E1 packaging)');
    }
  }

  // --- channels.js exports ---
  console.log('\n--- channels.js exports ---');
  const channelsPath = path.join(electronRoot, 'channels.js');
  if (fs.existsSync(channelsPath)) {
    try {
      // Clear cache so re-runs see disk state
      delete require.cache[require.resolve(channelsPath)];
      const ch = require(channelsPath);
      const requiredExports = [
        'CHANNELS',
        'NATIVE_BROWSER_COMMANDS',
        'SHELL_COMMANDS',
        'VOICE_COMMANDS',
        'MULTI_WINDOW_COMMANDS',
      ];
      for (const key of requiredExports) {
        if (ch[key] && typeof ch[key] === 'object') {
          const n = Object.keys(ch[key]).length;
          console.log(`[PASS] export ${key} (${n} keys)`);
        } else {
          missing.push(`channels.js export ${key}`);
          console.log(`[FAIL] missing export: ${key}`);
        }
      }

      // Spot-check critical channel / command names
      const spot = [
        ['CHANNELS', 'INVOKE', ch.CHANNELS?.INVOKE],
        ['CHANNELS', 'NATIVE_BROWSER_EVENT', ch.CHANNELS?.NATIVE_BROWSER_EVENT],
        ['NATIVE_BROWSER_COMMANDS', 'OPEN', ch.NATIVE_BROWSER_COMMANDS?.OPEN],
        ['NATIVE_BROWSER_COMMANDS', 'VISIBILITY', ch.NATIVE_BROWSER_COMMANDS?.VISIBILITY],
        ['SHELL_COMMANDS', 'DIALOG_OPEN', ch.SHELL_COMMANDS?.DIALOG_OPEN],
        ['VOICE_COMMANDS', 'SPEAK', ch.VOICE_COMMANDS?.SPEAK],
      ];
      for (const [group, key, val] of spot) {
        if (typeof val === 'string' && val.length > 0) {
          console.log(`[PASS] ${group}.${key} = ${val}`);
        } else {
          missing.push(`channels ${group}.${key}`);
          console.log(`[FAIL] channels ${group}.${key} missing or empty`);
        }
      }
    } catch (err) {
      missing.push('channels.js require failed');
      console.log('[FAIL] require channels.js:', err.message);
    }
  }

  // --- Unit tests presence ---
  console.log('\n--- Unit tests (presence) ---');
  requireWarn('src/lib/desktop/__tests__/desktopRuntime.test.js');
  requireWarn('src/lib/desktop/__tests__/desktopBridge.test.js');
  requireWarn('src/lib/desktop/__tests__/browserBounds.test.js');

  // --- Summary ---
  console.log('\n========== SUMMARY ==========');
  if (missing.length === 0) {
    console.log('RESULT: PASS (all critical checks)');
  } else {
    console.log('RESULT: FAIL');
    console.log('Missing critical items:');
    for (const m of missing) {
      console.log(`  - ${m}`);
    }
  }
  if (warnings.length > 0) {
    console.log('Warnings:');
    for (const w of warnings) {
      console.log(`  - ${w}`);
    }
  }
  console.log(
    '\nManual product QA: see openspec/changes/electron-desktop-host/qa-matrix.md'
  );
  console.log('Operator guide: docs/electron-desktop-host.md');

  process.exitCode = missing.length === 0 ? 0 : 1;
}

main();
