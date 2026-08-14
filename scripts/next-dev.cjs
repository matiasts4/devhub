#!/usr/bin/env node

const { spawnSync } = require('child_process');
const os = require('os');
const path = require('path');

// Always isolate from the installed app — do not inherit ~/.devhub / :4000 / NODE_ENV=production.
process.env.DEVHUB_HOME = path.join(os.homedir(), '.devhub-dev');
process.env.DEVHUB_DB_PATH = path.join(__dirname, '..', 'data', 'devhub.db');
process.env.DEVHUB_RUNTIME = 'development';
process.env.DEVHUB_TTY_PORT = '4078';
process.env.DEVHUB_WS_PORT = '3402';
if (!process.env.SIDECAR_PORT || process.env.SIDECAR_PORT === '4000') {
  process.env.SIDECAR_PORT = '4001';
}
if (!process.env.NODE_ENV || process.env.NODE_ENV === 'production') {
  process.env.NODE_ENV = 'development';
}

// Never leak the installed app's hook-bridge wiring into dev-spawned shells.
// When `npm start` runs from a terminal inside the installed app, the shell
// inherits DEVHUB_HOOK_* / DEVHUB_TERMINAL_ID; PTYs spawned by the dev server
// would then report agent hooks to the PRODUCTION sidecar (:4000) and ghost
// sessions would appear in the user's installed app.
delete process.env.DEVHUB_HOOK_URL;
delete process.env.DEVHUB_HOOK_TOKEN;
delete process.env.DEVHUB_HOOK_ENV;
delete process.env.DEVHUB_TERMINAL_ID;

// Dev default heap is ~0.5–1.5 GB and OOM kills Next mid-session (Failed to fetch /
// ERR_CONNECTION_REFUSED in the WebView). Packaging uses 1024; give dev more headroom.
// When this command runs from a terminal inside the installed app, the shell may
// inherit a restrictive --max-old-space-size (e.g. 384 MB from the PTY sidecar).
// Always replace it with the dev heap size so Next.js dev does not OOM.
const maxOldSpaceMb = String(process.env.DEVHUB_NEXT_MAX_OLD_SPACE_MB || '4096').trim() || '4096';
const heapFlag = `--max-old-space-size=${maxOldSpaceMb}`;
const existingNodeOptions = process.env.NODE_OPTIONS || '';
if (/--max-old-space-size=/.test(existingNodeOptions)) {
  process.env.NODE_OPTIONS = existingNodeOptions.replace(/--max-old-space-size=[^\s]+/g, heapFlag).trim();
} else {
  process.env.NODE_OPTIONS = existingNodeOptions
    ? `${existingNodeOptions} ${heapFlag}`.trim()
    : heapFlag;
}
// Ensure Zed tool/session logs appear in the same terminal as `pnpm tauri dev`.
if (process.env.ZED_LOG_CONSOLE == null) {
  process.env.ZED_LOG_CONSOLE = '1';
}
// Fast-path is local regex→tools WITHOUT the connected LLM (see ZED-ARCHITECTURE-01).
// Dev default OFF so "abre grok / open terminal" is decided by the real model.
// Re-enable for latency experiments: ZED_FAST_PATH=1
if (process.env.ZED_FAST_PATH == null) {
  process.env.ZED_FAST_PATH = '0';
}

const nextBin = path.join(__dirname, '..', 'node_modules', 'next', 'dist', 'bin', 'next');
const nextArgs = [nextBin, 'dev', '--port', '3100'];
// DEVHUB_NEXT_BUNDLER=webpack avoids silent Turbopack native crashes on Windows
// (vercel/next.js#95015: next dev exits with no error; --webpack stays up).
if (process.env.DEVHUB_NEXT_BUNDLER === 'webpack') {
  nextArgs.push('--webpack');
}
const result = spawnSync(process.execPath, nextArgs, {
  stdio: 'inherit',
  env: process.env,
});

process.exit(typeof result.status === 'number' ? result.status : 1);
