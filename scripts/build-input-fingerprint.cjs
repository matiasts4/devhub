#!/usr/bin/env node

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const CACHE_DIR = path.join(ROOT, '.devhub-build');
const FINGERPRINT_PATH = path.join(CACHE_DIR, 'standalone-fingerprint.json');
const STANDALONE_ZIP = path.join(ROOT, 'src-tauri', 'resources', 'standalone.zip');
const STANDALONE_DIR = path.join(ROOT, '.next', 'standalone');
const BUILD_ID_PATH = path.join(ROOT, '.next', 'BUILD_ID');

const ROOT_FILES = [
  'next.config.js',
  'package.json',
  'pnpm-lock.yaml',
  'package-lock.json',
  'postcss.config.js',
  'postcss.config.mjs',
  'tailwind.config.js',
  'tailwind.config.ts',
  'tsconfig.json',
];

const STANDALONE_SCRIPT_FILES = [
  'scripts/build-standalone-zip.cjs',
  'scripts/materialize-standalone-runtime.cjs',
  'scripts/build-input-fingerprint.cjs',
];

const WALK_ROOTS = ['src', 'public'];

const SKIP_DIR_NAMES = new Set([
  '__tests__',
  '.git',
  'node_modules',
  '.next',
  'coverage',
]);

const SKIP_FILE_PATTERN = /\.(test|spec)\.[jt]sx?$/;

function shouldSkipRelativePath(relativePath) {
  const normalized = relativePath.split(path.sep).join('/');
  if (normalized.includes('/__tests__/')) return true;
  if (SKIP_FILE_PATTERN.test(normalized)) return true;
  return false;
}

function walkFiles(rootDir, relativeRoot, bucket) {
  if (!fs.existsSync(rootDir)) return;

  const entries = fs.readdirSync(rootDir, { withFileTypes: true });
  for (const entry of entries) {
    if (SKIP_DIR_NAMES.has(entry.name)) continue;

    const absolutePath = path.join(rootDir, entry.name);
    const relativePath = path.join(relativeRoot, entry.name);

    if (shouldSkipRelativePath(relativePath)) continue;

    if (entry.isDirectory()) {
      walkFiles(absolutePath, relativePath, bucket);
      continue;
    }

    if (!entry.isFile()) continue;

    const stat = fs.statSync(absolutePath);
    bucket.push({
      path: relativePath.split(path.sep).join('/'),
      size: stat.size,
      mtimeMs: stat.mtimeMs,
    });
  }
}

function collectFingerprintEntries() {
  const entries = [];

  for (const name of ROOT_FILES) {
    const absolutePath = path.join(ROOT, name);
    if (!fs.existsSync(absolutePath)) continue;
    const stat = fs.statSync(absolutePath);
    entries.push({
      path: name,
      size: stat.size,
      mtimeMs: stat.mtimeMs,
    });
  }

  for (const name of STANDALONE_SCRIPT_FILES) {
    const absolutePath = path.join(ROOT, name);
    if (!fs.existsSync(absolutePath)) continue;
    const stat = fs.statSync(absolutePath);
    entries.push({
      path: name.split(path.sep).join('/'),
      size: stat.size,
      mtimeMs: stat.mtimeMs,
    });
  }

  for (const relativeRoot of WALK_ROOTS) {
    walkFiles(path.join(ROOT, relativeRoot), relativeRoot, entries);
  }

  entries.sort((left, right) => left.path.localeCompare(right.path));
  return entries;
}

function computeStandaloneBuildFingerprint() {
  const entries = collectFingerprintEntries();
  const hash = crypto.createHash('sha256');
  for (const entry of entries) {
    hash.update(`${entry.path}\0${entry.size}\0${entry.mtimeMs}\n`);
  }
  return {
    version: 1,
    algorithm: 'sha256-path-size-mtime-v1',
    fileCount: entries.length,
    digest: hash.digest('hex'),
  };
}

function readStoredFingerprint() {
  try {
    return JSON.parse(fs.readFileSync(FINGERPRINT_PATH, 'utf8'));
  } catch (_error) {
    return null;
  }
}

function writeStoredFingerprint(fingerprint, extra = {}) {
  fs.mkdirSync(CACHE_DIR, { recursive: true });
  const payload = {
    ...fingerprint,
    ...extra,
    writtenAt: new Date().toISOString(),
  };
  fs.writeFileSync(FINGERPRINT_PATH, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
}

function readBuildId() {
  try {
    return fs.readFileSync(BUILD_ID_PATH, 'utf8').trim();
  } catch (_error) {
    return null;
  }
}

function standaloneArtifactsReady() {
  if (!fs.existsSync(STANDALONE_ZIP)) return false;
  if (!fs.existsSync(path.join(STANDALONE_DIR, 'server.js'))) return false;
  return true;
}

function shouldSkipStandaloneProductionBuild({ force = false } = {}) {
  if (force) {
    return { skip: false, reason: 'force' };
  }

  if (!standaloneArtifactsReady()) {
    return { skip: false, reason: 'artifacts-missing' };
  }

  const current = computeStandaloneBuildFingerprint();
  const stored = readStoredFingerprint();
  if (!stored || stored.digest !== current.digest) {
    return { skip: false, reason: 'fingerprint-changed', current, stored };
  }

  const buildId = readBuildId();
  if (stored.buildId && buildId && stored.buildId !== buildId) {
    return { skip: false, reason: 'build-id-changed', current, stored };
  }

  return { skip: true, reason: 'cache-hit', current, stored };
}

module.exports = {
  CACHE_DIR,
  FINGERPRINT_PATH,
  STANDALONE_ZIP,
  computeStandaloneBuildFingerprint,
  readStoredFingerprint,
  writeStoredFingerprint,
  shouldSkipStandaloneProductionBuild,
  collectFingerprintEntries,
};