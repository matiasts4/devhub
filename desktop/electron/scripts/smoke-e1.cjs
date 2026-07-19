'use strict';

/**
 * E1 shell parity smoke preflight (non-interactive).
 * Checks modules load, packaging helpers, channel names, and optional UI/sidecar.
 *
 * Exit 0 unless --strict and a required check fails.
 *
 * Usage:
 *   node desktop/electron/scripts/smoke-e1.cjs
 *   node desktop/electron/scripts/smoke-e1.cjs --strict
 */

const fs = require('fs');
const path = require('path');
const http = require('http');

const root = path.resolve(__dirname, '..', '..', '..');
const electronDir = path.join(root, 'desktop', 'electron');
const strict = process.argv.includes('--strict');

let failed = 0;

function check(name, ok, detail = '') {
  const mark = ok ? 'PASS' : 'FAIL';
  if (!ok) failed += 1;
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

function requireLocal(rel) {
  return require(path.join(electronDir, rel));
}

async function main() {
  console.log('DevHub Electron E1 shell smoke preflight\n');

  const electronPkg = path.join(root, 'node_modules', 'electron', 'package.json');
  check('electron package installed', fs.existsSync(electronPkg), electronPkg);

  const files = [
    'main.js',
    'preload.js',
    'window.js',
    'tray.js',
    'channels.js',
    'ipc/index.js',
    'ipc/shell.js',
    'packaging/runtime.js',
    'electron-builder.yml',
  ];
  for (const f of files) {
    check(`${f} exists`, fs.existsSync(path.join(electronDir, f)));
  }

  // Channels contract
  const { SHELL_COMMANDS, CHANNELS } = requireLocal('channels.js');
  const required = [
    'desktop_ping',
    'window_minimize',
    'window_maximize',
    'window_unmaximize',
    'window_toggle_maximize',
    'window_close',
    'window_is_maximized',
    'window_show',
    'window_hide',
    'read_system_clipboard_text',
    'write_system_clipboard_text',
    'read_system_clipboard_image',
    'write_clipboard_image_to_temp_file',
    'dialog_open',
    'notify_show',
    'notify_request_permission',
    'runtime_status',
    'runtime_ensure',
  ];
  for (const name of required) {
    check(`channel ${name}`, Object.values(SHELL_COMMANDS).includes(name));
  }
  check('INVOKE channel', CHANNELS.INVOKE === 'desktop:invoke');
  check('WINDOW_EVENT channel', CHANNELS.WINDOW_EVENT === 'desktop:window:event');

  // Packaging helpers (no Electron app)
  const runtime = requireLocal('packaging/runtime.js');
  const status = runtime.runtimeStatus({ app: null });
  check('runtimeStatus.mode is dev', status.mode === 'dev', JSON.stringify(status.mode));
  check('runtimeStatus has uiUrl', typeof status.uiUrl === 'string' && status.uiUrl.length > 0);

  const ensured = await runtime.ensureRuntime({ app: null });
  check('ensureRuntime mode dev', ensured.mode === 'dev');
  check('ensureRuntime does not force extract in dev', ensured.standalone.extracted === false);

  // Router loads (soft-require voice/multiWindow)
  const ipc = requireLocal('ipc/index.js');
  check('isShellCommand(desktop_ping)', ipc.isShellCommand('desktop_ping') === true);
  check('isShellCommand(unknown)', ipc.isShellCommand('nope') === false);

  // Tray icon resolution (no Tray construct without app ready)
  const tray = requireLocal('tray.js');
  const icon = tray.resolveTrayIconPath();
  check('tray icon path resolved (optional)', true, icon || 'none — placeholder at runtime');

  // electron-builder config present
  const builderYml = path.join(electronDir, 'electron-builder.yml');
  const yml = fs.readFileSync(builderYml, 'utf8');
  check('electron-builder has nsis', /nsis/i.test(yml));
  check('electron-builder main path', /desktop\/electron\/main\.js/.test(yml));

  // Optional live services (informational — never fail strict mode)
  const ui = process.env.DEVHUB_ELECTRON_URL || 'http://127.0.0.1:3100';
  const uiOk = await httpOk(ui);
  console.log(`[${uiOk ? 'PASS' : 'SKIP'}] UI origin reachable (optional) — ${ui}`);

  const port = process.env.SIDECAR_PORT || '4001';
  const sidecarOk = await httpOk(`http://127.0.0.1:${port}/health`);
  console.log(
    `[${sidecarOk ? 'PASS' : 'SKIP'}] sidecar health (optional) — :${port}/health`
  );

  // package.json scripts
  const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
  check('script electron:dev', Boolean(pkg.scripts?.['electron:dev']));
  check('script electron:build', Boolean(pkg.scripts?.['electron:build']));
  check('script electron:pack', Boolean(pkg.scripts?.['electron:pack']));
  check('script electron:smoke-e1', Boolean(pkg.scripts?.['electron:smoke-e1']));

  console.log('\nManual steps after `pnpm electron:dev`:');
  console.log('  await window.devhubDesktop.invoke("desktop_ping")');
  console.log('  await window.devhubDesktop.invoke("window_is_maximized")');
  console.log('  await window.devhubDesktop.invoke("window_minimize")');
  console.log('  await window.devhubDesktop.invoke("read_system_clipboard_text")');
  console.log('  await window.devhubDesktop.invoke("write_system_clipboard_text", { text: "hi" })');
  console.log('  await window.devhubDesktop.invoke("read_system_clipboard_image")');
  console.log('  await window.devhubDesktop.invoke("dialog_open", { multiple: false })');
  console.log('  await window.devhubDesktop.invoke("notify_show", { title: "DevHub", body: "E1" })');
  console.log('  await window.devhubDesktop.invoke("notify_request_permission")');
  console.log('  await window.devhubDesktop.invoke("runtime_status")');
  console.log('  await window.devhubDesktop.invoke("runtime_ensure")');
  console.log('  Tray: right-click → Show / Quit');

  console.log(`\nResult: ${failed === 0 ? 'OK' : `${failed} failure(s)`}`);

  if (strict && failed > 0) {
    process.exitCode = 1;
  }
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
