#!/usr/bin/env node

const { execFileSync } = require('child_process');
const path = require('path');

function prependNodeBinToPath(nodeBin, currentPath = process.env.PATH || '') {
  const nodeDir = nodeBin ? path.dirname(nodeBin) : '';
  if (!nodeDir) {
    return currentPath;
  }

  const segments = currentPath.split(path.delimiter).filter(Boolean);
  const deduped = segments.filter((segment) => segment !== nodeDir);
  return [nodeDir, ...deduped].join(path.delimiter);
}

function runNodeCheckScript({
  cwd,
  script,
  exec = execFileSync,
  nodeBin = process.execPath,
}) {
  return exec(nodeBin, ['-e', script], {
    cwd,
    stdio: 'pipe',
  });
}

function createDefaultChecks({
  cwd = process.cwd(),
  runNodeCheck = runNodeCheckScript,
  nodeBin = process.execPath,
} = {}) {
  return {
    'better-sqlite3': () => {
      runNodeCheck({
        cwd,
        nodeBin,
        script: `
          const Database = require('better-sqlite3');
          const db = new Database(':memory:');
          db.prepare('SELECT 1 AS value').get();
          db.close();
        `,
      });
    },
    // node-pty is loaded by the Next.js runtime from the PROJECT ROOT
    // (src/lib/terminal/ttyServer.js uses eval('require')('node-pty'),
    // which resolves against the root node_modules — not sidecar-backend).
    // The shipped pnpm prebuilds only cover darwin-x64, darwin-arm64,
    // win32-x64, and win32-arm64, so on Linux this check forces a source
    // build of build/Release/pty.node before the dev/build runtime starts.
    'node-pty': () => {
      runNodeCheck({
        cwd,
        nodeBin,
        script: `
          const pty = require('node-pty');
          if (typeof pty.spawn !== 'function') {
            throw new Error('node-pty spawn unavailable');
          }
        `,
      });
    },
    // The sidecar-backend ships its own node_modules/node-pty for the
    // packaged Tauri sidecar binary, so it has to load successfully there too.
    'node-pty-sidecar': () => {
      runNodeCheck({
        cwd: path.join(cwd, 'sidecar-backend'),
        nodeBin,
        script: `
          const pty = require('node-pty');
          if (typeof pty.spawn !== 'function') {
            throw new Error('node-pty spawn unavailable');
          }
        `,
      });
    },
  };
}

function runChecks({ checks = createDefaultChecks({ cwd: process.cwd() }) } = {}) {
  const failures = [];

  for (const [moduleName, check] of Object.entries(checks)) {
    try {
      check();
    } catch (error) {
      failures.push({
        moduleName,
        message: error?.message || String(error),
      });
    }
  }

  return failures;
}

function rebuildNativeModules({
  cwd = process.cwd(),
  exec = execFileSync,
  nodeBin = process.execPath,
} = {}) {
  const env = {
    ...process.env,
    PATH: prependNodeBinToPath(nodeBin),
  };

  exec('npm', ['rebuild', 'better-sqlite3'], {
    cwd,
    stdio: 'inherit',
    env,
  });

  // Rebuild node-pty in the PROJECT ROOT first — this is where the Next.js
  // runtime loads it from. Without a Linux prebuild in node-pty@1.1.0, this
  // produces build/Release/pty.node so `require('node-pty')` resolves at
  // runtime instead of throwing "Failed to load native module: pty.node".
  exec('npm', ['rebuild', 'node-pty'], {
    cwd,
    stdio: 'inherit',
    env,
  });

  // Also rebuild the sidecar-backend copy used by the packaged Tauri sidecar.
  exec('npm', ['rebuild', 'node-pty'], {
    cwd: path.join(cwd, 'sidecar-backend'),
    stdio: 'inherit',
    env,
  });
}

function ensureNativeRuntime({
  cwd = process.cwd(),
  exec = execFileSync,
  log = console,
  checks,
  nodeBin = process.execPath,
} = {}) {
  const activeChecks =
    checks ||
    createDefaultChecks({
      cwd,
      nodeBin,
    });
  let failures = runChecks({ checks: activeChecks });

  if (failures.length === 0) {
    return { rebuilt: false, failures: [] };
  }

  log.warn?.(
    `[native:ensure] Native module mismatch detected: ${failures
      .map((failure) => `${failure.moduleName}: ${failure.message}`)
      .join(' | ')}`
  );

  rebuildNativeModules({ cwd, exec, nodeBin });

  failures = runChecks({ checks: activeChecks });
  if (failures.length > 0) {
    const error = new Error(
      `[native:ensure] Native runtime still invalid after rebuild: ${failures
        .map((failure) => `${failure.moduleName}: ${failure.message}`)
        .join(' | ')}`
    );
    error.failures = failures;
    throw error;
  }

  log.info?.('[native:ensure] Native modules rebuilt successfully');
  return { rebuilt: true, failures: [] };
}

if (require.main === module) {
  try {
    const result = ensureNativeRuntime();
    if (!result.rebuilt) {
      console.log('[native:ensure] Native modules already healthy');
    }
  } catch (error) {
    console.error(error?.message || String(error));
    process.exit(1);
  }
}

module.exports = {
  createDefaultChecks,
  ensureNativeRuntime,
  prependNodeBinToPath,
  rebuildNativeModules,
  runChecks,
  runNodeCheckScript,
};
