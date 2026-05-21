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
    'node-pty': () => {
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
