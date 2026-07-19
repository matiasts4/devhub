'use strict';

/**
 * Non-interactive E0 checklist helper (prints steps; does not drive UI automation).
 * Exit 0 always unless --strict and electron binary missing.
 */

const fs = require('fs');
const path = require('path');
const http = require('http');

const root = path.resolve(__dirname, '..', '..', '..');
const strict = process.argv.includes('--strict');

function check(name, ok, detail = '') {
  const mark = ok ? 'PASS' : 'FAIL';
  console.log(`[${mark}] ${name}${detail ? ` — ${detail}` : ''}`);
  return ok;
}

function httpOk(url, timeoutMs = 1500) {
  return new Promise((resolve) => {
    const req = http.get(url, { timeout: timeoutMs }, (res) => {
      res.resume();
      resolve(res.statusCode >= 200 && res.statusCode < 500);
    });
    req.on('error', () => resolve(false));
    req.on('timeout', () => {
      req.destroy();
      resolve(false);
    });
  });
}

async function main() {
  console.log('DevHub Electron E0 smoke preflight\n');

  const electronPkg = path.join(root, 'node_modules', 'electron', 'package.json');
  const hasElectron = fs.existsSync(electronPkg);
  check('electron package installed', hasElectron, electronPkg);

  const mainEntry = path.join(root, 'desktop', 'electron', 'main.js');
  check('main.js exists', fs.existsSync(mainEntry));

  const preload = path.join(root, 'desktop', 'electron', 'preload.js');
  check('preload.js exists', fs.existsSync(preload));

  const ui = process.env.DEVHUB_ELECTRON_URL || 'http://127.0.0.1:3100';
  const uiOk = await httpOk(ui);
  check('UI origin reachable', uiOk, ui);

  const port = process.env.SIDECAR_PORT || '4001';
  const sidecarOk = await httpOk(`http://127.0.0.1:${port}/health`);
  check('sidecar health (optional for shell-only)', sidecarOk, `:${port}/health`);

  console.log('\nManual steps after `pnpm electron:dev`:');
  console.log('  1. window.devhubDesktop.isElectron === true');
  console.log("  2. invoke native_browser_probe → ready");
  console.log("  3. invoke native_browser_open with https://example.com");
  console.log('  4. open Terminales session if sidecar healthy');
  console.log('  5. invoke native_browser_close');

  if (strict && !hasElectron) {
    process.exitCode = 1;
  }
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
