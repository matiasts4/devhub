#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

const STANDALONE_DIR = path.join(process.cwd(), '.next', 'standalone');
const NODE_MODULES = path.join(STANDALONE_DIR, 'node_modules');
const PROJECT_NODE_MODULES = path.join(process.cwd(), 'node_modules');

// Next standalone tracing leaves some runtime deps as package.json-only stubs
// (pnpm hoists metadata but not the files Next resolves at the top level).
const INJECTED_PACKAGES = ['ws', 'node-pty', '@swc/helpers'];

const REQUIRED_CHECKS = [
  {
    label: 'ws',
    file: path.join(NODE_MODULES, 'ws', 'index.js'),
  },
  {
    label: 'node-pty',
    file: path.join(NODE_MODULES, 'node-pty', 'package.json'),
  },
  {
    label: 'better-sqlite3',
    file: path.join(NODE_MODULES, 'better-sqlite3', 'package.json'),
  },
  {
    label: '@swc/helpers',
    file: path.join(
      NODE_MODULES,
      '@swc',
      'helpers',
      'cjs',
      '_interop_require_default.cjs'
    ),
  },
  {
    label: '@next/env',
    file: path.join(NODE_MODULES, '@next', 'env', 'dist', 'index.js'),
  },
];

function collectSymlinks(rootDir) {
  const symlinks = [];

  function walk(currentDir) {
    let entries = [];
    try {
      entries = fs.readdirSync(currentDir, { withFileTypes: true });
    } catch (_error) {
      return;
    }

    for (const entry of entries) {
      const fullPath = path.join(currentDir, entry.name);
      if (entry.isSymbolicLink()) {
        symlinks.push(fullPath);
        continue;
      }
      if (entry.isDirectory()) {
        walk(fullPath);
      }
    }
  }

  walk(rootDir);
  return symlinks.sort(
    (left, right) => right.split(path.sep).length - left.split(path.sep).length
  );
}

function materializeSymlink(linkPath) {
  const linkTarget = fs.readlinkSync(linkPath);
  const resolvedTarget = path.resolve(path.dirname(linkPath), linkTarget);

  if (!fs.existsSync(resolvedTarget)) {
    throw new Error(
      `Broken symlink in standalone runtime: ${linkPath} -> ${linkTarget} (resolved: ${resolvedTarget})`
    );
  }

  const tempPath = `${linkPath}.materialize.tmp`;
  fs.rmSync(tempPath, { recursive: true, force: true });
  fs.cpSync(resolvedTarget, tempPath, { recursive: true, dereference: true });
  fs.rmSync(linkPath, { recursive: true, force: true });
  fs.renameSync(tempPath, linkPath);
}

function injectPackageFromProject(packageName) {
  const sourceDir = path.join(PROJECT_NODE_MODULES, ...packageName.split('/'));
  const targetDir = path.join(NODE_MODULES, ...packageName.split('/'));

  if (!fs.existsSync(sourceDir)) {
    throw new Error(`Project dependency missing: ${sourceDir}`);
  }

  fs.rmSync(targetDir, { recursive: true, force: true });
  fs.cpSync(sourceDir, targetDir, { recursive: true, dereference: true });
}

function injectRequiredPackages() {
  for (const packageName of INJECTED_PACKAGES) {
    injectPackageFromProject(packageName);
  }
}

function countNonPackageJsonFiles(packageDir) {
  let count = 0;

  function walk(currentDir) {
    let entries = [];
    try {
      entries = fs.readdirSync(currentDir, { withFileTypes: true });
    } catch (_error) {
      return;
    }

    for (const entry of entries) {
      const fullPath = path.join(currentDir, entry.name);
      if (entry.isFile() && entry.name !== 'package.json') {
        count += 1;
        continue;
      }
      if (entry.isDirectory()) {
        walk(fullPath);
      }
    }
  }

  walk(packageDir);
  return count;
}

function isPackageJsonOnlyStub(packageDir) {
  return (
    fs.existsSync(path.join(packageDir, 'package.json')) &&
    countNonPackageJsonFiles(packageDir) === 0
  );
}

function listStandalonePackageDirs() {
  const packageDirs = [];

  function addPackageDir(relativePath) {
    packageDirs.push(path.join(NODE_MODULES, ...relativePath.split('/')));
  }

  for (const entry of fs.readdirSync(NODE_MODULES, { withFileTypes: true })) {
    if (!entry.isDirectory() || entry.name === '.pnpm') continue;

    if (entry.name.startsWith('@')) {
      const scopeDir = path.join(NODE_MODULES, entry.name);
      for (const scopedEntry of fs.readdirSync(scopeDir, { withFileTypes: true })) {
        if (scopedEntry.isDirectory()) {
          addPackageDir(`${entry.name}/${scopedEntry.name}`);
        }
      }
      continue;
    }

    addPackageDir(entry.name);
  }

  return packageDirs;
}

function repairPackageJsonStubs() {
  for (const packageDir of listStandalonePackageDirs()) {
    if (!isPackageJsonOnlyStub(packageDir)) continue;

    const relativePath = path.relative(NODE_MODULES, packageDir);
    const sourceDir = path.join(PROJECT_NODE_MODULES, ...relativePath.split(path.sep));
    if (!fs.existsSync(sourceDir) || isPackageJsonOnlyStub(sourceDir)) {
      continue;
    }

    injectPackageFromProject(relativePath.split(path.sep).join('/'));
  }
}

function materializeStandaloneNodeModules() {
  if (!fs.existsSync(NODE_MODULES)) {
    throw new Error(`Standalone node_modules not found at ${NODE_MODULES}`);
  }

  injectRequiredPackages();
  repairPackageJsonStubs();

  const symlinks = collectSymlinks(NODE_MODULES);
  for (const linkPath of symlinks) {
    materializeSymlink(linkPath);
  }

  const remaining = collectSymlinks(NODE_MODULES);
  if (remaining.length > 0) {
    throw new Error(
      `Standalone runtime still contains ${remaining.length} symlink(s) after materialization`
    );
  }
}

function assertRequiredFiles() {
  const missing = REQUIRED_CHECKS.filter((check) => !fs.existsSync(check.file));
  if (missing.length > 0) {
    throw new Error(
      `Standalone runtime missing required files: ${missing
        .map((check) => `${check.label} (${check.file})`)
        .join(', ')}`
    );
  }
}

function main() {
  materializeStandaloneNodeModules();
  assertRequiredFiles();
  console.log('[standalone:materialize] Symlinks materialized and runtime checks passed');
}

if (require.main === module) {
  try {
    main();
  } catch (error) {
    console.error(error?.message || String(error));
    process.exit(1);
  }
}

module.exports = {
  STANDALONE_DIR,
  INJECTED_PACKAGES,
  assertRequiredFiles,
  collectSymlinks,
  injectPackageFromProject,
  injectRequiredPackages,
  isPackageJsonOnlyStub,
  repairPackageJsonStubs,
  materializeStandaloneNodeModules,
  materializeSymlink,
};