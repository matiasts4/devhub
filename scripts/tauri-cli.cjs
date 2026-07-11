#!/usr/bin/env node

const { execFileSync, spawnSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const REQUIRED_GTK_PACKAGES = ['javascriptcoregtk-4.1', 'libsoup-3.0', 'webkit2gtk-4.1'];
const SYSTEM_PKG_CONFIG = '/usr/bin/pkg-config';
const TAURI_CLI_ENTRY = path.join(__dirname, '..', 'node_modules', '@tauri-apps', 'cli', 'tauri.js');
const TAURI_CONF_PATH = path.join(__dirname, '..', 'src-tauri', 'tauri.conf.json');
const DEFAULT_LINUX_PKG_CONFIG_PATHS = ['/usr/lib/x86_64-linux-gnu/pkgconfig', '/usr/share/pkgconfig'];
const DEV_URL_READY_PATH = '/api/agenthub/config';
const PACKAGING_SIDECAR_WRAPPER = path.join(__dirname, '..', 'packaging', 'devhub-server.cjs');
const DEV_ISOLATION = {
  DEVHUB_HOME: path.join(os.homedir(), '.devhub-dev'),
  DEVHUB_RUNTIME: 'development',
  SIDECAR_PORT: '4001',
  DEVHUB_TTY_PORT: '4078',
  DEVHUB_WS_PORT: '3402',
};

function mergePkgConfigPath(existingValue, platform = process.platform) {
  if (platform !== 'linux') {
    return existingValue;
  }

  const existingParts = String(existingValue || '')
    .split(':')
    .map((value) => value.trim())
    .filter(Boolean);

  return [...new Set([...DEFAULT_LINUX_PKG_CONFIG_PATHS, ...existingParts])].join(':');
}

function pkgConfigResolves({ command, env, execFileSync: exec = execFileSync }) {
  exec(command, ['--exists', ...REQUIRED_GTK_PACKAGES], {
    env,
    stdio: 'ignore',
  });
  return true;
}

function shouldPreferSystemPkgConfig({
  env,
  platform = process.platform,
  execFileSync: exec = execFileSync,
  existsSync = fs.existsSync,
} = {}) {
  if (platform !== 'linux' || env.PKG_CONFIG) {
    return false;
  }

  try {
    pkgConfigResolves({ command: 'pkg-config', env, execFileSync: exec });
    return false;
  } catch (_error) {
    if (!existsSync(SYSTEM_PKG_CONFIG)) {
      return false;
    }
  }

  try {
    pkgConfigResolves({ command: SYSTEM_PKG_CONFIG, env, execFileSync: exec });
    return true;
  } catch (_error) {
    return false;
  }
}

/**
 * Force disjoint runtime from the installed app. Shells often inherit
 * DEVHUB_HOME=~/.devhub and SIDECAR_PORT=4000 from a running install; without
 * this, `pnpm tauri dev` adopts/kills production PTY/Next.
 */
function applyDevIsolationEnv(env = {}) {
  const nextEnv = { ...env, ...DEV_ISOLATION };
  // Next.js warns and behaves inconsistently when NODE_ENV=production under `next dev`.
  if (!nextEnv.NODE_ENV || nextEnv.NODE_ENV === 'production') {
    nextEnv.NODE_ENV = 'development';
  }
  return nextEnv;
}

/**
 * Keep the debug-tree wrapper in sync with packaging/ so tauri dev never runs a
 * stale cjs that pre-kills :3400 (coexistence regression).
 */
function syncDevhubServerWrapperForDev({
  existsSync = fs.existsSync,
  copyFileSync = fs.copyFileSync,
  mkdirSync = fs.mkdirSync,
} = {}) {
  if (!existsSync(PACKAGING_SIDECAR_WRAPPER)) {
    return;
  }
  const targets = [
    path.join(__dirname, '..', 'src-tauri', 'resources', 'devhub-server.cjs'),
    path.join(__dirname, '..', 'src-tauri', 'target', 'debug', 'devhub-server.cjs'),
  ];
  for (const target of targets) {
    try {
      mkdirSync(path.dirname(target), { recursive: true });
      copyFileSync(PACKAGING_SIDECAR_WRAPPER, target);
    } catch (_error) {
      // non-fatal: cargo/tauri may recreate resources later
    }
  }
}

function buildTauriEnv({
  env = process.env,
  platform = process.platform,
  execFileSync: exec = execFileSync,
  existsSync = fs.existsSync,
  forDev = false,
} = {}) {
  let nextEnv = { ...env };

  if (forDev) {
    nextEnv = applyDevIsolationEnv(nextEnv);
  }

  if (platform === 'linux') {
    nextEnv.PKG_CONFIG_PATH = mergePkgConfigPath(nextEnv.PKG_CONFIG_PATH, platform);
  }

  if (
    shouldPreferSystemPkgConfig({
      env: nextEnv,
      platform,
      execFileSync: exec,
      existsSync,
    })
  ) {
    nextEnv.PKG_CONFIG = SYSTEM_PKG_CONFIG;
  }

  return nextEnv;
}

function readTauriBuildConfig({
  configPath = TAURI_CONF_PATH,
  readFileSync = fs.readFileSync,
} = {}) {
  try {
    const parsed = JSON.parse(readFileSync(configPath, 'utf8'));
    return parsed?.build || null;
  } catch (_error) {
    return null;
  }
}

function isReadyHttpStatus(status) {
  return Number.isInteger(status) && status >= 200 && status < 400;
}

function buildDevReadyProbeUrl(url, readinessPath = DEV_URL_READY_PATH) {
  if (!url) {
    return null;
  }

  try {
    return new URL(readinessPath, url).toString();
  } catch (_error) {
    return null;
  }
}

function isDevUrlReady(url, { spawnSync: spawn = spawnSync } = {}) {
  const probeTarget = buildDevReadyProbeUrl(url);

  if (!probeTarget) {
    return false;
  }

  const probeScript = [
    'const target = process.argv[1];',
    'const parsed = new URL(target);',
    "const client = parsed.protocol === 'https:' ? require('https') : require('http');",
    'const req = client.request(target, { method: \"GET\", timeout: 500 }, (res) => {',
    '  process.exit(res.statusCode >= 200 && res.statusCode < 400 ? 0 : 1);',
    '});',
    'req.on(\"timeout\", () => { req.destroy(); process.exit(1); });',
    'req.on(\"error\", () => process.exit(1));',
    'req.end();',
  ].join(' ');

  const result = spawn(process.execPath, ['-e', probeScript, probeTarget], {
    stdio: 'ignore',
  });

  return result.status === 0;
}

function injectArgsBeforeAppArgs(args, extraArgs) {
  const appArgsIndex = args.indexOf('--');

  if (appArgsIndex === -1) {
    return [...args, ...extraArgs];
  }

  return [...args.slice(0, appArgsIndex), ...extraArgs, ...args.slice(appArgsIndex)];
}

function resolveTauriCliArgs({ args = [], buildConfig = null, devUrlReady = false } = {}) {
  if (
    args[0] !== 'dev'
    || !buildConfig?.beforeDevCommand
    || !buildConfig?.devUrl
    || !devUrlReady
  ) {
    return args;
  }

  return injectArgsBeforeAppArgs(args, ['-c', JSON.stringify({ build: { beforeDevCommand: '' } })]);
}

function syncDevhubServerSidecar() {
  const { syncLinuxSidecar, syncWindowsSidecar } = require('./build-devhub-server-sidecar.cjs');
  if (process.platform === 'linux') {
    syncLinuxSidecar();
    console.log('[tauri-cli] Synced Linux devhub-server sidecar wrapper');
    return;
  }
  if (process.platform === 'win32') {
    syncWindowsSidecar();
    console.log('[tauri-cli] Built Windows devhub-server sidecar wrapper');
  }
}

function patchPackagedDesktop() {
  // After tauri build on Linux, the generator produces a minimal desktop.
  // Overwrite it with our rich packaging/linux/DevHub.desktop (includes launcher Exec, WMClass, StartupNotify, keywords etc).
  // The deb.files map in tauri.conf also places the launcher; this ensures the .desktop is the canonical rich one.
  if (process.platform !== 'linux') return;
  const bundleRoot = path.join(__dirname, '..', 'src-tauri', 'target', 'release', 'bundle', 'deb');
  try {
    if (!fs.existsSync(bundleRoot)) return;
    const entries = fs.readdirSync(bundleRoot, { withFileTypes: true });
    for (const e of entries) {
      if (!e.isDirectory() || !e.name.startsWith('DevHub_')) continue;
      const desktopPath = path.join(bundleRoot, e.name, 'data', 'usr', 'share', 'applications', 'DevHub.desktop');
      const sourceDesktop = path.join(__dirname, '..', 'packaging', 'linux', 'DevHub.desktop');
      if (fs.existsSync(sourceDesktop) && fs.existsSync(path.dirname(desktopPath))) {
        fs.copyFileSync(sourceDesktop, desktopPath);
        // Ensure launcher (if mapped via deb.files) has exec bit in the data tree
        const launcherPath = path.join(bundleRoot, e.name, 'data', 'usr', 'lib', 'DevHub', 'bin', 'devhub-launcher');
        if (fs.existsSync(launcherPath)) {
          fs.chmodSync(launcherPath, 0o755);
        }
        const postinstCandidates = [
          path.join(bundleRoot, e.name, 'data', 'DEBIAN', 'postinst'),
          path.join(bundleRoot, e.name, 'DEBIAN', 'postinst'),
        ];
        for (const postinstPath of postinstCandidates) {
          if (fs.existsSync(postinstPath)) {
            fs.chmodSync(postinstPath, 0o755);
          }
        }
        console.log(`[tauri-cli] Patched desktop + launcher exec for ${e.name}`);
      }
    }
  } catch (err) {
    console.warn('[tauri-cli] Desktop patch skipped (non-fatal):', err?.message || err);
  }
}

function normalizeTauriCliArgs(args = []) {
  const separatorIndex = args.indexOf('--');
  if (separatorIndex === -1) {
    return args;
  }

  const before = args.slice(0, separatorIndex).filter(Boolean);
  const after = args.slice(separatorIndex + 1).filter(Boolean);
  return [...before, ...after];
}

function runTauriCli({
  args = normalizeTauriCliArgs(process.argv.slice(2)),
  env,
  spawnSync: spawn = spawnSync,
} = {}) {
  const isDev = args[0] === 'dev';
  const resolvedEnv = env || buildTauriEnv({ forDev: isDev });
  const buildConfig = readTauriBuildConfig();
  const cliArgs = resolveTauriCliArgs({
    args,
    buildConfig,
    devUrlReady: isDev ? isDevUrlReady(buildConfig?.devUrl, { spawnSync: spawn }) : false,
  });

  const isBuild = args.includes('build');
  if (isBuild) {
    syncDevhubServerSidecar();
  }
  if (isDev) {
    syncDevhubServerWrapperForDev();
    console.log(
      `[tauri-cli] Dev isolation: DEVHUB_HOME=${resolvedEnv.DEVHUB_HOME} SIDECAR_PORT=${resolvedEnv.SIDECAR_PORT} DEVHUB_RUNTIME=${resolvedEnv.DEVHUB_RUNTIME}`
    );
  }

  const result = spawn(process.execPath, [TAURI_CLI_ENTRY, ...cliArgs], {
    stdio: 'inherit',
    env: resolvedEnv,
  });

  if (result.error) {
    throw result.error;
  }

  if (typeof result.status === 'number') {
    if (result.status === 0 && isBuild) {
      patchPackagedDesktop();
    }
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
    runTauriCli();
  } catch (error) {
    console.error(error?.message || String(error));
    process.exit(1);
  }
}

module.exports = {
  normalizeTauriCliArgs,
  applyDevIsolationEnv,
  buildDevReadyProbeUrl,
  buildTauriEnv,
  DEV_ISOLATION,
  DEV_URL_READY_PATH,
  DEFAULT_LINUX_PKG_CONFIG_PATHS,
  injectArgsBeforeAppArgs,
  isDevUrlReady,
  isReadyHttpStatus,
  mergePkgConfigPath,
  pkgConfigResolves,
  REQUIRED_GTK_PACKAGES,
  readTauriBuildConfig,
  resolveTauriCliArgs,
  runTauriCli,
  shouldPreferSystemPkgConfig,
  syncDevhubServerWrapperForDev,
  SYSTEM_PKG_CONFIG,
  TAURI_CLI_ENTRY,
  TAURI_CONF_PATH,
};
