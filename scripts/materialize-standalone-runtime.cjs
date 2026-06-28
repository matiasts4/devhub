#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

const STANDALONE_DIR = path.join(process.cwd(), '.next', 'standalone');
const NODE_MODULES = path.join(STANDALONE_DIR, 'node_modules');
const NESTED_NODE_MODULES = path.join(STANDALONE_DIR, '.next', 'node_modules');
const PROJECT_NODE_MODULES = path.join(process.cwd(), 'node_modules');
const PROJECT_NEXT_NODE_MODULES = path.join(process.cwd(), '.next', 'node_modules');
const SERVER_CHUNKS_DIR = path.join(STANDALONE_DIR, '.next', 'server', 'chunks');

// Next standalone tracing leaves some runtime deps as package.json-only stubs
// (pnpm hoists metadata but not the files Next resolves at the top level).
const INJECTED_PACKAGES = ['ws', 'node-pty', '@swc/helpers', '@next/env', 'better-sqlite3', 'bindings', 'file-uri-to-path'];

// Turbopack rewrites serverExternalPackages to hashed module ids in server chunks.
const HASHED_EXTERNAL_BASES = ['better-sqlite3', 'node-pty', 'ws'];
const HASHED_EXTERNAL_PATTERN = new RegExp(
  `["']((?:${HASHED_EXTERNAL_BASES.join('|')})-[a-f0-9]{16})["']`,
  'g'
);

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

function findPnpmPackageFallback(linkPath, linkTarget) {
  const match = linkTarget.match(/^\.\.\/((?:@[^/]+\/)?[^/]+)@([^/]+)\/node_modules\/([^/]+)$/);
  if (!match) return null;
  const [, pkgName, pkgVersion, leafName] = match;
  if (leafName !== pkgName) return null;
  const candidate = path.join(PROJECT_NODE_MODULES, '.pnpm', `${pkgName}@${pkgVersion}`, 'node_modules', pkgName);
  return fs.existsSync(candidate) ? candidate : null;
}

function resolveProjectPackageDir(packageName) {
  const directDir = path.join(PROJECT_NODE_MODULES, ...packageName.split('/'));
  if (fs.existsSync(directDir)) {
    return directDir;
  }

  const pnpmDir = path.join(PROJECT_NODE_MODULES, '.pnpm');
  if (!fs.existsSync(pnpmDir)) {
    return null;
  }

  const prefix = `${packageName.replace('/', '+')}@`;
  const matches = fs
    .readdirSync(pnpmDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && entry.name.startsWith(prefix))
    .map((entry) => path.join(pnpmDir, entry.name, 'node_modules', ...packageName.split('/')))
    .filter((candidate) => fs.existsSync(candidate))
    .sort();

  return matches.at(-1) || null;
}

function materializeSymlink(linkPath) {
  const linkTarget = fs.readlinkSync(linkPath);
  let resolvedTarget = path.resolve(path.dirname(linkPath), linkTarget);

  if (!fs.existsSync(resolvedTarget)) {
    const fallback = findPnpmPackageFallback(linkPath, linkTarget);
    if (!fallback) {
      throw new Error(
        `Broken symlink in standalone runtime: ${linkPath} -> ${linkTarget} (resolved: ${resolvedTarget})`
      );
    }
    const fallbackParent = path.dirname(fallback);
    fs.mkdirSync(fallbackParent, { recursive: true });
    fs.cpSync(fallback, fallbackParent, { recursive: true, dereference: true });
    resolvedTarget = fallback;
  }

  const tempPath = `${linkPath}.materialize.tmp`;
  fs.rmSync(tempPath, { recursive: true, force: true });
  fs.cpSync(resolvedTarget, tempPath, { recursive: true, dereference: true });
  fs.rmSync(linkPath, { recursive: true, force: true });
  fs.renameSync(tempPath, linkPath);
}

function injectPackageFromProject(packageName, targetNodeModules = NODE_MODULES) {
  const sourceDir = resolveProjectPackageDir(packageName);
  const targetDir = path.join(targetNodeModules, ...packageName.split('/'));

  if (!sourceDir) {
    throw new Error(`Project dependency missing: ${packageName}`);
  }

  fs.rmSync(targetDir, { recursive: true, force: true });
  fs.cpSync(sourceDir, targetDir, { recursive: true, dereference: true });
}

function injectRequiredPackages(targetNodeModules = NODE_MODULES) {
  for (const packageName of INJECTED_PACKAGES) {
    injectPackageFromProject(packageName, targetNodeModules);
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

function listStandalonePackageDirs(nodeModulesDir) {
  const packageDirs = [];

  function addPackageDir(relativePath) {
    packageDirs.push(path.join(nodeModulesDir, ...relativePath.split('/')));
  }

  if (!fs.existsSync(nodeModulesDir)) {
    return packageDirs;
  }

  for (const entry of fs.readdirSync(nodeModulesDir, { withFileTypes: true })) {
    if (!entry.isDirectory() || entry.name === '.pnpm') continue;

    if (entry.name.startsWith('@')) {
      const scopeDir = path.join(nodeModulesDir, entry.name);
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

function repairPackageJsonStubs(nodeModulesDir) {
  for (const packageDir of listStandalonePackageDirs(nodeModulesDir)) {
    if (!isPackageJsonOnlyStub(packageDir)) continue;

    const relativePath = path.relative(nodeModulesDir, packageDir);
    const sourceDir = resolveProjectPackageDir(relativePath.split(path.sep).join('/'));
    if (!sourceDir || isPackageJsonOnlyStub(sourceDir)) {
      continue;
    }

    injectPackageFromProject(relativePath.split(path.sep).join('/'), nodeModulesDir);
  }
}

function materializeNodeModulesTree(nodeModulesDir) {
  if (!fs.existsSync(nodeModulesDir)) {
    return;
  }

  const symlinks = collectSymlinks(nodeModulesDir);
  for (const linkPath of symlinks) {
    materializeSymlink(linkPath);
  }

  const remaining = collectSymlinks(nodeModulesDir);
  if (remaining.length > 0) {
    throw new Error(
      `Standalone runtime still contains ${remaining.length} symlink(s) after materialization in ${nodeModulesDir}`
    );
  }
}

function discoverHashedExternalPackages() {
  if (!fs.existsSync(SERVER_CHUNKS_DIR)) {
    return [];
  }

  const hashedNames = new Set();
  for (const entry of fs.readdirSync(SERVER_CHUNKS_DIR, { withFileTypes: true })) {
    if (!entry.isFile() || !entry.name.endsWith('.js')) continue;

    const chunkSource = fs.readFileSync(path.join(SERVER_CHUNKS_DIR, entry.name), 'utf8');
    for (const match of chunkSource.matchAll(HASHED_EXTERNAL_PATTERN)) {
      hashedNames.add(match[1]);
    }
  }

  return [...hashedNames].sort();
}

function resolveHashedPackageSource(hashedName) {
  const candidates = [
    path.join(PROJECT_NEXT_NODE_MODULES, hashedName),
    path.join(NESTED_NODE_MODULES, hashedName),
    path.join(NODE_MODULES, hashedName),
  ];

  const baseName = hashedName.replace(/-[a-f0-9]{16}$/, '');
  candidates.push(
    path.join(PROJECT_NODE_MODULES, ...baseName.split('/')),
    path.join(NODE_MODULES, ...baseName.split('/'))
  );

  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) {
      return candidate;
    }
  }

  return null;
}

function ensureHashedExternalPackages() {
  const hashedNames = discoverHashedExternalPackages();
  if (hashedNames.length === 0) {
    return [];
  }

  fs.mkdirSync(NESTED_NODE_MODULES, { recursive: true });

  for (const hashedName of hashedNames) {
    const targetDir = path.join(NESTED_NODE_MODULES, hashedName);
    if (fs.existsSync(targetDir) && !isPackageJsonOnlyStub(targetDir)) {
      continue;
    }

    const sourceDir = resolveHashedPackageSource(hashedName);
    if (!sourceDir) {
      throw new Error(
        `Unable to resolve hashed external package "${hashedName}" for standalone runtime`
      );
    }

    fs.rmSync(targetDir, { recursive: true, force: true });
    fs.cpSync(sourceDir, targetDir, { recursive: true, dereference: true });
  }

  return hashedNames;
}

function buildRequiredChecks() {
  const checks = [
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

  for (const hashedName of discoverHashedExternalPackages()) {
    if (!hashedName.startsWith('better-sqlite3-')) continue;
    checks.push({
      label: hashedName,
      file: path.join(
        NESTED_NODE_MODULES,
        hashedName,
        'build',
        'Release',
        'better_sqlite3.node'
      ),
    });
  }

  return checks;
}

function assertRequiredFiles() {
  const missing = buildRequiredChecks().filter((check) => !fs.existsSync(check.file));
  if (missing.length > 0) {
    throw new Error(
      `Standalone runtime missing required files: ${missing
        .map((check) => `${check.label} (${check.file})`)
        .join(', ')}`
    );
  }
}

function materializeStandaloneNodeModules() {
  if (!fs.existsSync(NODE_MODULES)) {
    throw new Error(`Standalone node_modules not found at ${NODE_MODULES}`);
  }

  injectRequiredPackages(NODE_MODULES);
  repairPackageJsonStubs(NODE_MODULES);
  materializeNodeModulesTree(NODE_MODULES);

  const hashedNames = ensureHashedExternalPackages();
  if (hashedNames.length > 0) {
    repairPackageJsonStubs(NESTED_NODE_MODULES);
    materializeNodeModulesTree(NESTED_NODE_MODULES);
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
  NESTED_NODE_MODULES,
  INJECTED_PACKAGES,
  HASHED_EXTERNAL_PATTERN,
  assertRequiredFiles,
  collectSymlinks,
  discoverHashedExternalPackages,
  ensureHashedExternalPackages,
  injectPackageFromProject,
  injectRequiredPackages,
  isPackageJsonOnlyStub,
  repairPackageJsonStubs,
  materializeStandaloneNodeModules,
  materializeNodeModulesTree,
  materializeSymlink,
  resolveHashedPackageSource,
};