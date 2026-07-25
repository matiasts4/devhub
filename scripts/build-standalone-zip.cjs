#!/usr/bin/env node

const { execFileSync, execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const STANDALONE_DIR = path.join(ROOT, '.next', 'standalone');
const ZIP_PATH = path.join(ROOT, 'src-tauri', 'resources', 'standalone.zip');

function copyRecursive(src, dest) {
  fs.cpSync(src, dest, { recursive: true, force: true });
}

function removeIfExists(targetPath) {
  fs.rmSync(targetPath, { recursive: true, force: true });
}

function walkDir(dir, callback) {
  if (!fs.existsSync(dir)) return;
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      walkDir(fullPath, callback);
      callback(fullPath, entry);
    } else {
      callback(fullPath, entry);
    }
  }
}

function pruneSourceMapsAndSymbols() {
  const extensions = new Set(['.map', '.pdb', '.tsbuildinfo']);
  walkDir(STANDALONE_DIR, (filePath, entry) => {
    if (!entry.isFile()) return;
    const ext = path.extname(filePath).toLowerCase();
    if (extensions.has(ext)) {
      fs.rmSync(filePath, { force: true });
    }
  });
}

function pruneTestFiles() {
  walkDir(STANDALONE_DIR, (filePath, entry) => {
    if (entry.isDirectory()) {
      if (entry.name === '__tests__' || entry.name === '__mocks__' || entry.name === 'test' || entry.name === 'tests') {
        removeIfExists(filePath);
      }
      return;
    }
    const base = path.basename(filePath);
    if (/\.(test|spec)\.(js|jsx|ts|tsx|mjs|cjs)$/.test(base)) {
      fs.rmSync(filePath, { force: true });
    }
  });
}

function pruneSharpFromStandalone() {
  // sharp is only used at build-time for icon generation; it is not imported
  // by the runtime server, so it can be removed from the standalone payload.
  const roots = [
    path.join(STANDALONE_DIR, 'node_modules', '@img'),
    path.join(STANDALONE_DIR, 'node_modules', '.pnpm', 'node_modules', '@img'),
    path.join(STANDALONE_DIR, '.next', 'node_modules', '@img'),
  ];
  for (const root of roots) {
    if (!fs.existsSync(root)) continue;
    for (const entry of fs.readdirSync(root)) {
      if (entry.startsWith('sharp-')) {
        removeIfExists(path.join(root, entry));
      }
    }
  }
  const sharpPackageRoots = [
    path.join(STANDALONE_DIR, 'node_modules', 'sharp'),
    path.join(STANDALONE_DIR, '.next', 'node_modules', 'sharp'),
  ];
  for (const sharpRoot of sharpPackageRoots) {
    if (fs.existsSync(sharpRoot)) {
      removeIfExists(sharpRoot);
    }
  }
}

function pruneBetterSqlite3DevFiles() {
  // better-sqlite3 ships a full copy of sqlite3.c and build objects that are
  // not needed at runtime once the native binding is built.
  const roots = [
    path.join(STANDALONE_DIR, 'node_modules', 'better-sqlite3'),
    path.join(STANDALONE_DIR, '.next', 'node_modules'),
  ];
  for (const root of roots) {
    if (!fs.existsSync(root)) continue;
    if (path.basename(root) === 'better-sqlite3') {
      removeIfExists(path.join(root, 'deps'));
      removeIfExists(path.join(root, 'src'));
      removeIfExists(path.join(root, 'build', 'Release', 'obj.target'));
      continue;
    }
    // .next/node_modules contains hashed copies like better-sqlite3-XXXX.
    for (const entry of fs.readdirSync(root)) {
      if (entry.startsWith('better-sqlite3-')) {
        const pkgDir = path.join(root, entry);
        removeIfExists(path.join(pkgDir, 'deps'));
        removeIfExists(path.join(pkgDir, 'src'));
        removeIfExists(path.join(pkgDir, 'build', 'Release', 'obj.target'));
      }
    }
  }
}

function pruneNodePtySymbols() {
  // node-pty prebuilds include debug symbols that are not required in production.
  const roots = [
    path.join(STANDALONE_DIR, 'node_modules', 'node-pty'),
    path.join(STANDALONE_DIR, '.next', 'node_modules', 'node-pty'),
  ];
  for (const root of roots) {
    if (!fs.existsSync(root)) continue;
    walkDir(path.join(root, 'prebuilds'), (filePath, entry) => {
      if (entry.isFile() && filePath.endsWith('.pdb')) {
        fs.rmSync(filePath, { force: true });
      }
    });
  }
}

function dedupeNodePtyOpenConsole() {
  // node-pty bundles OpenConsole.exe in multiple locations; keep only the
  // prebuild copy that is loaded at runtime.
  const keep = path.join(STANDALONE_DIR, 'node_modules', 'node-pty', 'prebuilds', 'win32-x64', 'conpty', 'OpenConsole.exe');
  const duplicates = [
    path.join(STANDALONE_DIR, 'node_modules', 'node-pty', 'build', 'Release', 'conpty', 'OpenConsole.exe'),
    path.join(STANDALONE_DIR, 'node_modules', 'node-pty', 'third_party', 'conpty', '1.23.251008001', 'win10-x64', 'OpenConsole.exe'),
    path.join(STANDALONE_DIR, 'node_modules', 'node-pty', 'third_party', 'conpty', '1.23.251008001', 'win10-arm64', 'OpenConsole.exe'),
  ];
  for (const dup of duplicates) {
    if (fs.existsSync(dup) && dup !== keep) {
      fs.rmSync(dup, { force: true });
    }
  }
}

function pruneDataDirectory() {
  // data/ contains runtime SQLite databases and backups that should not be
  // distributed with the installer.
  removeIfExists(path.join(STANDALONE_DIR, 'data'));
}

/**
 * Next/file-tracing and accidental copies sometimes land whole-repo trees in
 * `.next/standalone` (graphify-out, openspec, tmp, docs…). None of these are
 * needed to serve the packaged Next runtime.
 */
const JUNK_TOP_LEVEL_DIRS = [
  'graphify-out',
  'openspec',
  'tmp',
  'docs',
  'research',
  'opencode',
  'sidecar-backend',
  'telegram-bot',
  'sdd',
  'devhub-cli',
  'test_reports',
  'memories',
  'memory',
  'skills',
  'plugins',
  'bin',
  'lib',
  'dist',
  'data',
];

const JUNK_TOP_LEVEL_FILES = [
  'AGENTS.md',
  '.gitignore',
  'build_log.txt',
  'build_log_optimized.txt',
  'build_log_sccache.txt',
];

function pruneJunkTopLevel(rootDir = STANDALONE_DIR) {
  for (const name of JUNK_TOP_LEVEL_DIRS) {
    removeIfExists(path.join(rootDir, name));
  }
  for (const name of JUNK_TOP_LEVEL_FILES) {
    const filePath = path.join(rootDir, name);
    if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
      fs.rmSync(filePath, { force: true });
    }
  }
  // Nested docs/logs that sneak under src/ (not runtime).
  removeIfExists(path.join(rootDir, 'src', 'docs'));
  removeIfExists(path.join(rootDir, 'src', 'tmp'));
}

function pruneLinuxMuslSharp() {
  if (process.platform !== 'linux') return;
  const nm = path.join(STANDALONE_DIR, 'node_modules');
  if (!fs.existsSync(nm)) return;
  for (const entry of fs.readdirSync(nm)) {
    if (/^@img\/sharp.*linuxmusl/i.test(entry) || /^sharp.*linuxmusl/i.test(entry)) {
      removeIfExists(path.join(nm, entry));
    }
  }
}

function pruneNodePtyPrebuilds() {
  const prebuildsDir = path.join(STANDALONE_DIR, 'node_modules', 'node-pty', 'prebuilds');
  if (!fs.existsSync(prebuildsDir)) return;
  const keep = process.platform === 'win32' ? 'win32-x64' : `${process.platform}-${process.arch}`;
  for (const entry of fs.readdirSync(prebuildsDir)) {
    if (entry !== keep) {
      removeIfExists(path.join(prebuildsDir, entry));
    }
  }
}

function pruneUnusedSharpPrebuilds() {
  if (process.platform !== 'win32') return;
  const keep = 'sharp-win32-x64';
  const imgRoots = [
    path.join(STANDALONE_DIR, 'node_modules', '@img'),
    path.join(STANDALONE_DIR, 'node_modules', '.pnpm', 'node_modules', '@img'),
  ];
  for (const imgRoot of imgRoots) {
    if (!fs.existsSync(imgRoot)) continue;
    for (const entry of fs.readdirSync(imgRoot)) {
      if (entry.startsWith('sharp-') && entry !== keep) {
        removeIfExists(path.join(imgRoot, entry));
      }
    }
  }
}

function createZipArchive(sourceDir, zipPath) {
  fs.mkdirSync(path.dirname(zipPath), { recursive: true });
  const tempZipPath = `${zipPath}.${process.pid}.tmp`;

  removeIfExists(tempZipPath);

  if (process.platform === 'win32') {
    // Git Bash tar does not understand Windows drive letters (D:/... looks like a host).
    // Pass a relative POSIX path so it stays inside the cwd.
    const tempZipRelative = path.relative(sourceDir, tempZipPath).replace(/\\/g, '/');
    try {
      execFileSync('tar', ['-a', '-c', '-f', tempZipRelative, '.'], {
        cwd: sourceDir,
        stdio: 'inherit',
      });
    } catch (tarError) {
      if (!fs.existsSync(tempZipPath) || fs.statSync(tempZipPath).size < 1000) {
        throw tarError;
      }
    }
  } else {
    execFileSync('zip', ['-q', '-ry', tempZipPath, '.'], {
      cwd: sourceDir,
      stdio: 'inherit',
    });
  }

  try {
    removeIfExists(zipPath);
    fs.renameSync(tempZipPath, zipPath);
  } catch (error) {
    try {
      fs.copyFileSync(tempZipPath, zipPath);
      removeIfExists(tempZipPath);
    } catch (copyError) {
      throw copyError;
    }
  }
}

function main() {
  if (!fs.existsSync(STANDALONE_DIR)) {
    throw new Error(`Standalone output missing at ${STANDALONE_DIR}. Run next build first.`);
  }

  copyRecursive(path.join(ROOT, 'public'), path.join(STANDALONE_DIR, 'public'));
  copyRecursive(
    path.join(ROOT, '.next', 'static'),
    path.join(STANDALONE_DIR, '.next', 'static')
  );
  fs.mkdirSync(path.join(STANDALONE_DIR, 'src'), { recursive: true });
  copyRecursive(path.join(ROOT, 'src', 'lib'), path.join(STANDALONE_DIR, 'src', 'lib'));

  removeIfExists(path.join(STANDALONE_DIR, 'src-tauri'));
  removeIfExists(path.join(STANDALONE_DIR, '.next', 'cache'));
  pruneLinuxMuslSharp();

  require('./materialize-standalone-runtime.cjs').materializeStandaloneNodeModules();
  require('./materialize-standalone-runtime.cjs').assertRequiredFiles();

  // Prune after materialization because injectPackageFromProject copies the full package tree.
  pruneNodePtyPrebuilds();
  pruneUnusedSharpPrebuilds();

  // Additional pruning to reduce installer size without affecting runtime.
  pruneDataDirectory();
  pruneJunkTopLevel();
  pruneSharpFromStandalone();
  pruneSourceMapsAndSymbols();
  pruneTestFiles();
  pruneBetterSqlite3DevFiles();
  pruneNodePtySymbols();
  dedupeNodePtyOpenConsole();

  createZipArchive(STANDALONE_DIR, ZIP_PATH);
  console.log(`[build:standalone] Wrote ${ZIP_PATH}`);
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
  createZipArchive,
  main,
  pruneJunkTopLevel,
  JUNK_TOP_LEVEL_DIRS,
  JUNK_TOP_LEVEL_FILES,
  STANDALONE_DIR,
};