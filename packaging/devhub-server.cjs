#!/usr/bin/env node

const { spawn, spawnSync, execSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

let LOG_FILE = null;

function initLogFile(devhubDir) {
  if (!devhubDir) return;
  try {
    ensureDir(devhubDir);
    LOG_FILE = path.join(devhubDir, 'wrapper.log');
    fs.appendFileSync(LOG_FILE, `\n[Wrapper ${new Date().toISOString()}] --- wrapper started (PID ${process.pid}) ---\n`);
  } catch (_error) {
    LOG_FILE = null;
  }
}

function logStep(message) {
  const line = `[Wrapper ${new Date().toISOString()}] ${message}`;
  console.log(line);
  if (LOG_FILE) {
    try {
      fs.appendFileSync(LOG_FILE, `${line}\n`);
    } catch (_error) {}
  }
}

function fileMtimeMs(filePath) {
  try {
    return fs.statSync(filePath).mtimeMs;
  } catch (_error) {
    return 0;
  }
}

function ensureDir(dirPath) {
  fs.mkdirSync(dirPath, { recursive: true });
}

function pathExists(targetPath) {
  try {
    fs.accessSync(targetPath);
    return true;
  } catch (_error) {
    return false;
  }
}

function findFirstFile(rootDir, fileName) {
  if (!pathExists(rootDir)) return null;
  const queue = [rootDir];
  while (queue.length > 0) {
    const current = queue.shift();
    let entries = [];
    try {
      entries = fs.readdirSync(current, { withFileTypes: true });
    } catch (_error) {
      continue;
    }
    for (const entry of entries) {
      const fullPath = path.join(current, entry.name);
      if (entry.isFile() && entry.name === fileName) return fullPath;
      if (entry.isDirectory()) queue.push(fullPath);
    }
  }
  return null;
}

function resolveInstalledZipPath(prefix) {
  const candidates = [
    path.join(prefix, 'resources', 'standalone.zip'),
    path.join(prefix, 'standalone.zip'),
  ];
  return candidates.find((candidate) => pathExists(candidate)) || null;
}

function resolvePtyPath(prefix) {
  const candidates = [
    path.join(prefix, 'sidecar-backend', 'server.js'),
    path.join(prefix, '_up_', 'sidecar-backend', 'server.js'),
  ];
  return candidates.find((candidate) => pathExists(candidate)) || null;
}

function findProjectRoot(startDir) {
  let current = path.resolve(startDir);
  for (let depth = 0; depth < 10; depth += 1) {
    if (pathExists(path.join(current, 'sidecar-backend', 'server.js'))) {
      return current;
    }
    const parent = path.dirname(current);
    if (parent === current) break;
    current = parent;
  }
  return null;
}

/**
 * Heuristic: a packaged install never has a package.json/.git ancestor near the
 * PTY sidecar, but the local repo does. This prevents the dev wrapper from
 * mistaking D:\devhub\sidecar-backend\server.js for a system install.
 */
function looksLikeDevRepo(ptyPath) {
  if (!ptyPath) return false;
  let current = path.dirname(ptyPath);
  for (let depth = 0; depth < 6; depth += 1) {
    if (pathExists(path.join(current, '.git'))) return true;
    const pkgPath = path.join(current, 'package.json');
    if (pathExists(pkgPath)) {
      try {
        const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
        if (pkg.name === 'frontend') return true;
      } catch (_) {}
    }
    const parent = path.dirname(current);
    if (parent === current) break;
    current = parent;
  }
  return false;
}

function extractZip(zipPath, destinationDir) {
  ensureDir(destinationDir);
  if (process.platform === 'win32') {
    if (pathExists(destinationDir)) {
      fs.rmSync(destinationDir, { recursive: true, force: true });
    }
    ensureDir(destinationDir);
    // Use the Windows native tar.exe. The MSYS tar shipped with Git Bash treats
    // Windows drive letters (C:/...) as remote hosts and fails with
    // "Cannot connect to C: resolve failed".
    const systemRoot = process.env.SystemRoot || process.env.windir || 'C:\\Windows';
    const tarBin = path.join(systemRoot, 'System32', 'tar.exe');
    execSync(`"${tarBin}" -xf "${zipPath}" -C "${destinationDir}"`, { stdio: 'inherit' });
    return;
  }

  execSync(`unzip -q "${zipPath}" -d "${destinationDir}"`, { stdio: 'inherit' });
}

function reextractStandaloneRuntime(zipPath, label, devhubDir) {
  if (!zipPath || !pathExists(zipPath)) {
    logStep(`Warning: cannot re-extract runtime (${label}), standalone.zip missing`);
    return false;
  }

  const destination = path.join(devhubDir, 'standalone');
  logStep(`Re-extracting standalone.zip (${label}) to ${destination}...`);
  if (pathExists(destination)) {
    fs.rmSync(destination, { recursive: true, force: true });
  }
  extractZip(zipPath, destination);

  const serverPath = path.join(destination, 'server.js');
  if (pathExists(serverPath)) {
    const now = new Date();
    fs.utimesSync(serverPath, now, now);
  }
  return true;
}

function shouldReextractStandalone(zipPath, devhubDir) {
  const serverPath = path.join(devhubDir, 'standalone', 'server.js');
  if (!pathExists(serverPath)) return true;
  if (fileMtimeMs(zipPath) > fileMtimeMs(serverPath)) return true;

  const runtimeDir = path.join(devhubDir, 'standalone');
  const checks = [
    path.join(runtimeDir, 'node_modules', 'ws', 'index.js'),
    path.join(runtimeDir, 'node_modules', 'node-pty', 'package.json'),
    path.join(runtimeDir, 'node_modules', '@swc', 'helpers', 'cjs', '_interop_require_default.cjs'),
    path.join(runtimeDir, 'node_modules', '@next', 'env', 'dist', 'index.js'),
  ];

  if (checks.some((candidate) => !pathExists(candidate))) return true;

  const nestedModules = path.join(runtimeDir, '.next', 'node_modules');
  if (!pathExists(nestedModules)) return true;
  const nestedEntries = fs.readdirSync(nestedModules);
  const hasSqliteBinding = nestedEntries.some((entry) => {
    if (!entry.startsWith('better-sqlite3-')) return false;
    return pathExists(
      path.join(nestedModules, entry, 'build', 'Release', 'better_sqlite3.node')
    );
  });
  return !hasSqliteBinding;
}

function resolveNodeBin() {
  const candidates = [
    process.env.DEVHUB_NODE_BIN,
    process.execPath.endsWith('node.exe') || process.execPath.endsWith('node') ? process.execPath : null,
    process.platform === 'win32' ? 'C:\\Program Files\\nodejs\\node.exe' : '/usr/bin/node',
  ].filter(Boolean);

  for (const candidate of candidates) {
    if (pathExists(candidate)) return candidate;
  }

  const which = spawnSync(process.platform === 'win32' ? 'where' : 'which', ['node'], {
    encoding: 'utf8',
  });
  if (which.status === 0) {
    const resolved = which.stdout.split(/\r?\n/).map((line) => line.trim()).find(Boolean);
    if (resolved && pathExists(resolved)) return resolved;
  }

  throw new Error('Node.js runtime not found for DevHub sidecar');
}

function resolveNpmBin(nodeBin) {
  const candidates = [
    process.env.DEVHUB_NPM_BIN,
    path.join(path.dirname(nodeBin), process.platform === 'win32' ? 'npm.cmd' : 'npm'),
  ].filter(Boolean);

  for (const candidate of candidates) {
    if (pathExists(candidate)) return candidate;
  }
  return null;
}

function buildNodeOptions(maxOldSpaceMb, extraOptions = '') {
  const parts = [`--max-old-space-size=${maxOldSpaceMb}`];
  if (process.env.NODE_OPTIONS) parts.push(process.env.NODE_OPTIONS);
  if (extraOptions) parts.push(extraOptions);
  return parts.join(' ').trim();
}

function checkBetterSqlite3(runtimeDir, nodeBin) {
  const binding = findFirstFile(runtimeDir, 'better_sqlite3.node');
  if (binding) return true;
  return false;
}

function checkNodePty(runtimeDir, nodeBin) {
  const result = spawnSync(nodeBin, ['-e', "try { const pty = require('node-pty'); if (typeof pty.spawn !== 'function') process.exit(2); } catch (error) { console.error(error); process.exit(1); }"], {
    cwd: runtimeDir,
    stdio: 'pipe',
    env: { ...process.env, NODE_PATH: path.join(runtimeDir, 'node_modules') },
  });
  return result.status === 0;
}

function ensureNativeRuntime({ runtimeDir, packageName, label, checkKind, nodeBin, npmBin }) {
  if (!runtimeDir || !pathExists(runtimeDir)) {
    logStep(`Native runtime skip (${label}): directory not found`);
    return true;
  }

  const healthy =
    checkKind === 'better-sqlite3'
      ? checkBetterSqlite3(runtimeDir, nodeBin)
      : checkNodePty(runtimeDir, nodeBin);
  if (healthy) return true;

  if (!npmBin) {
    throw new Error(`npm not available to rebuild ${packageName} for ${label}`);
  }

  logStep(`Native module mismatch detected in ${label} (${packageName}). Running npm rebuild...`);
  const result = spawnSync(npmBin, ['rebuild', packageName], {
    cwd: runtimeDir,
    stdio: 'inherit',
    env: {
      ...process.env,
      PATH: `${path.dirname(nodeBin)}${path.delimiter}${process.env.PATH || ''}`,
    },
    shell: process.platform === 'win32',
  });
  if (result.status !== 0) {
    throw new Error(`npm rebuild ${packageName} failed for ${label}`);
  }

  return checkKind === 'better-sqlite3'
    ? checkBetterSqlite3(runtimeDir, nodeBin)
    : checkNodePty(runtimeDir, nodeBin);
}

function killListenersOnPort(port) {
  if (process.platform === 'win32') {
    try {
      const output = execSync(`netstat -ano | findstr :${port}`, { encoding: 'utf8' });
      const pids = new Set();
      for (const line of output.split(/\r?\n/)) {
        const match = line.trim().match(/:(\d+)\s+.*?\s+(\d+)\s*$/);
        if (!match) continue;
        const seenPort = Number(match[1]);
        const pid = Number(match[2]);
        if (seenPort === port && pid > 0 && pid !== process.pid) pids.add(pid);
      }
      for (const pid of pids) {
        logStep(`Pre-killing listener PID ${pid} on :${port}`);
        try {
          execSync(`taskkill /PID ${pid} /T /F`, { stdio: 'ignore' });
        } catch (_error) {}
      }
    } catch (_error) {}
    return;
  }

  try {
    const output = execSync(`ss -tlnp "sport = :${port}"`, { encoding: 'utf8' });
    const pids = [...output.matchAll(/pid=(\d+)/g)].map((match) => Number(match[1]));
    for (const pid of pids) {
      if (!pid || pid === process.pid) continue;
      logStep(`Pre-killing listener PID ${pid} on :${port}`);
      try {
        process.kill(pid, 'SIGTERM');
      } catch (_error) {}
    }
  } catch (_error) {}
}

function detectLayout() {
  // Use the script's directory, not process.execPath. When the Rust launcher
  // spawns `node <install-dir>/resources/devhub-server.cjs`, execPath points
  // to the Node binary, so we would never find the packaged standalone.zip.
  const scriptDir = __dirname;
  const devhubDirFromEnv = process.env.DEVHUB_HOME || '';
  let devhubDir = devhubDirFromEnv || path.join(os.homedir(), '.devhub');
  let isSystemInstall = 0;
  let nextPath = '';
  let ptyPath = '';
  let installPrefix = '';

  const resourceCandidates = [
    path.join(scriptDir, 'resources'),
    path.join(scriptDir, '_up_', 'resources'),
    path.join(scriptDir, '..', 'resources'),
    path.join(scriptDir),
    path.join(scriptDir, '_up_'),
  ];

  for (const candidate of resourceCandidates) {
    const zipPath = resolveInstalledZipPath(candidate) || resolveInstalledZipPath(path.dirname(candidate));
    const ptyCandidate = resolvePtyPath(candidate) || resolvePtyPath(path.dirname(candidate));
    // Only treat a bare PTY sidecar as a system install if it does not live
    // inside the local development repository.
    const validSystemPty = ptyCandidate && !looksLikeDevRepo(ptyCandidate);
    if (zipPath || validSystemPty) {
      isSystemInstall = 1;
      installPrefix = path.dirname(zipPath || ptyCandidate);
      devhubDir = path.join(os.homedir(), '.devhub');
      ensureDir(devhubDir);

      if (zipPath) {
        if (shouldReextractStandalone(zipPath, devhubDir)) {
          reextractStandaloneRuntime(zipPath, 'installed package', devhubDir) || process.exit(1);
        }
        const buildId = Math.floor(fileMtimeMs(zipPath) / 1000);
        fs.writeFileSync(path.join(devhubDir, 'sidecar-build-id.txt'), String(buildId));
        logStep(`Build-id: ${buildId} -> ${path.join(devhubDir, 'sidecar-build-id.txt')}`);
      }

      const standaloneServer = path.join(devhubDir, 'standalone', 'server.js');
      if (pathExists(standaloneServer)) {
        nextPath = standaloneServer;
      }
      ptyPath = ptyCandidate || ptyPath;
      break;
    }
  }

  if (!isSystemInstall) {
    const root = findProjectRoot(scriptDir) || findProjectRoot(process.cwd()) || process.cwd();
    devhubDir = devhubDirFromEnv || path.join(os.homedir(), '.devhub-dev');
    ensureDir(devhubDir);
    logStep('Dev mode detected: Next is managed by tauri dev on 3100');
    nextPath = '';
    ptyPath = path.join(root, 'sidecar-backend', 'server.js');
  }

  return { devhubDir, isSystemInstall, nextPath, ptyPath, installPrefix };
}

function main() {
  logStep(`Starting wrapper (PID ${process.pid})`);
  const layout = detectLayout();
  initLogFile(layout.devhubDir);
  const nodeBin = resolveNodeBin();
  const npmBin = resolveNpmBin(nodeBin);

  logStep(`DEVHUB_DIR=${layout.devhubDir}`);
  logStep(`PTY Path: ${layout.ptyPath || '<none>'}`);
  logStep(`Next Path: ${layout.nextPath || '<none>'}`);
  logStep(`Using Node: ${nodeBin}`);

  const sidecarPort = process.env.SIDECAR_PORT || (layout.isSystemInstall ? '4000' : '4001');
  const nextPort = process.env.PORT || (layout.isSystemInstall ? '3400' : '3100');

  if (layout.nextPath && pathExists(layout.nextPath)) {
    ensureNativeRuntime({
      runtimeDir: path.dirname(layout.nextPath),
      packageName: 'better-sqlite3',
      label: 'Next standalone',
      checkKind: 'better-sqlite3',
      nodeBin,
      npmBin,
    });
  }

  if (layout.ptyPath && pathExists(layout.ptyPath)) {
    ensureNativeRuntime({
      runtimeDir: path.dirname(layout.ptyPath),
      packageName: 'node-pty',
      label: 'PTY sidecar',
      checkKind: 'node-pty',
      nodeBin,
      npmBin,
    });
  }

  if (layout.nextPath && pathExists(layout.nextPath)) {
    killListenersOnPort(Number(sidecarPort));
    killListenersOnPort(Number(nextPort));
  } else {
    killListenersOnPort(Number(sidecarPort));
  }

  const children = [];
  const spawnChild = (label, scriptPath, env) => {
    logStep(`Launching ${label}...`);
    const child = spawn(nodeBin, [scriptPath], {
      cwd: path.dirname(scriptPath),
      env: { ...process.env, ...env },
      stdio: 'inherit',
      shell: false,
    });
    children.push(child);
    return child;
  };

  if (layout.ptyPath && pathExists(layout.ptyPath)) {
    spawnChild(`PTY sidecar (:${sidecarPort})`, layout.ptyPath, {
      DEVHUB_HOME: layout.devhubDir,
      SIDECAR_PORT: sidecarPort,
      NODE_OPTIONS: buildNodeOptions(process.env.DEVHUB_PTY_MAX_OLD_SPACE_MB || '384', process.env.DEVHUB_PTY_NODE_OPTIONS_EXTRA || ''),
      NODE_ENV: 'production',
    });
  } else {
    logStep('Error: PTY path not found');
  }

  if (layout.nextPath && pathExists(layout.nextPath)) {
    spawnChild(`Next.js standalone (:${nextPort})`, layout.nextPath, {
      DEVHUB_HOME: layout.devhubDir,
      PORT: nextPort,
      NODE_PATH: path.join(path.dirname(layout.nextPath), 'node_modules'),
      NODE_OPTIONS: buildNodeOptions(process.env.DEVHUB_NEXT_MAX_OLD_SPACE_MB || '1024', process.env.DEVHUB_NEXT_NODE_OPTIONS_EXTRA || ''),
      NODE_ENV: 'production',
    });
  } else {
    logStep('Next not launched (likely dev mode)');
  }

  const shutdown = () => {
    logStep('Shutting down child processes...');
    for (const child of children) {
      try {
        if (process.platform === 'win32') {
          execSync(`taskkill /PID ${child.pid} /T /F`, { stdio: 'ignore' });
        } else {
          child.kill('SIGTERM');
        }
      } catch (_error) {}
    }
    process.exit(0);
  };

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);

  if (children.length === 0) {
    logStep('No child processes started, exiting...');
    setTimeout(() => process.exit(1), 5000);
    return;
  }

  for (const child of children) {
    child.on('exit', (code) => {
      logStep(`Child PID ${child.pid} exited with code ${code ?? 'null'}`);
      shutdown();
    });
  }
}

if (require.main === module) {
  try {
    main();
  } catch (error) {
    console.error(error?.stack || error?.message || String(error));
    process.exit(1);
  }
}

module.exports = { detectLayout, main };