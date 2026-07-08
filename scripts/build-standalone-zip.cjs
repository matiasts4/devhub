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
    execFileSync('tar', ['-a', '-c', '-f', tempZipRelative, '.'], {
      cwd: sourceDir,
      stdio: 'inherit',
    });
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

function pruneStaleStandaloneZipTemps(zipPath = ZIP_PATH) {
  const resourcesDir = path.dirname(zipPath);
  if (!fs.existsSync(resourcesDir)) return;
  for (const entry of fs.readdirSync(resourcesDir)) {
    if (/^standalone\.zip\..+\.tmp$/i.test(entry)) {
      removeIfExists(path.join(resourcesDir, entry));
    }
  }
}

function main() {
  pruneStaleStandaloneZipTemps();

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

module.exports = { createZipArchive, main, pruneStaleStandaloneZipTemps };