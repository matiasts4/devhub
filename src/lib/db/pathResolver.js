const fs = require('fs');
const os = require('os');
const path = require('path');

function ensureDirectory(dirPath) {
  fs.mkdirSync(dirPath, { recursive: true });
  return dirPath;
}

function findExistingPath(startDir, ...relativeSegments) {
  let currentDir = path.resolve(startDir);

  for (let depth = 0; depth <= 6; depth += 1) {
    const candidate = path.join(currentDir, ...relativeSegments);
    if (fs.existsSync(candidate)) return candidate;

    const parentDir = path.dirname(currentDir);
    if (parentDir === currentDir) break;
    currentDir = parentDir;
  }

  return null;
}

function uniquePaths(paths) {
  return [...new Set(paths.filter(Boolean).map((value) => path.resolve(value)))];
}

function sqliteFamilyPaths(dbPath) {
  return [dbPath, `${dbPath}-wal`, `${dbPath}-shm`];
}

function getNewestMtimeMs(dbPath) {
  return sqliteFamilyPaths(dbPath).reduce((latest, filePath) => {
    if (!fs.existsSync(filePath)) return latest;
    return Math.max(latest, fs.statSync(filePath).mtimeMs);
  }, 0);
}

function copySqliteFamily(sourceDbPath, targetDbPath) {
  ensureDirectory(path.dirname(targetDbPath));

  for (const [index, sourcePath] of sqliteFamilyPaths(sourceDbPath).entries()) {
    const targetPath = sqliteFamilyPaths(targetDbPath)[index];
    if (fs.existsSync(sourcePath)) {
      fs.copyFileSync(sourcePath, targetPath);
      continue;
    }

    if (fs.existsSync(/*turbopackIgnore: true*/ targetPath)) {
      fs.rmSync(/*turbopackIgnore: true*/ targetPath, { force: true });
    }
  }
}

function getCanonicalDevhubDir({ env = process.env, homeDir = os.homedir() } = {}) {
  const explicitHome = env.DEVHUB_HOME ? path.resolve(env.DEVHUB_HOME) : path.join(homeDir, '.devhub');
  return ensureDirectory(explicitHome);
}

function getCanonicalDataDir(options = {}) {
  const { env = process.env } = options;
  const explicitDataDir = env.DEVHUB_DATA_DIR
    ? path.resolve(env.DEVHUB_DATA_DIR)
    : path.join(getCanonicalDevhubDir(options), 'data');
  return ensureDirectory(explicitDataDir);
}

function getLegacyDbCandidates({ cwd = process.cwd(), moduleDir = __dirname, homeDir = os.homedir() } = {}) {
  return uniquePaths([
    findExistingPath(cwd, 'data', 'devhub.db'),
    findExistingPath(moduleDir, 'data', 'devhub.db'),
    findExistingPath(cwd, '.next', 'standalone', 'data', 'devhub.db'),
    findExistingPath(moduleDir, '.next', 'standalone', 'data', 'devhub.db'),
    path.join(homeDir, '.devhub', 'standalone', 'data', 'devhub.db'),
    path.join(homeDir, '.devhub', 'devhub.db'),
  ]).filter((candidate) => fs.existsSync(candidate));
}

function maybeMigrateLegacyDb(canonicalDbPath, options = {}) {
  if (fs.existsSync(canonicalDbPath) && fs.statSync(canonicalDbPath).size > 0) {
    return canonicalDbPath;
  }

  const legacyCandidates = getLegacyDbCandidates(options).filter(
    (candidate) => path.resolve(candidate) !== path.resolve(canonicalDbPath) && fs.statSync(candidate).size > 0
  );

  if (legacyCandidates.length === 0) {
    return canonicalDbPath;
  }

  const newestLegacyDbPath = legacyCandidates.sort(
    (left, right) => getNewestMtimeMs(right) - getNewestMtimeMs(left)
  )[0];

  copySqliteFamily(newestLegacyDbPath, canonicalDbPath);
  return canonicalDbPath;
}

function resolveDbPath(options = {}) {
  const env = options.env || process.env;

  if (env.DEVHUB_DB_PATH) {
    const explicitDbPath = path.resolve(env.DEVHUB_DB_PATH);
    ensureDirectory(path.dirname(explicitDbPath));
    return explicitDbPath;
  }

  if (env.NODE_ENV === 'test' && !options.forceCanonicalInTests) {
    const testDbPath = path.join(options.cwd || process.cwd(), 'data', 'devhub.db');
    ensureDirectory(path.dirname(testDbPath));
    return testDbPath;
  }

  const canonicalDbPath = path.join(getCanonicalDataDir(options), 'devhub.db');
  ensureDirectory(path.dirname(canonicalDbPath));
  return maybeMigrateLegacyDb(canonicalDbPath, options);
}

module.exports = {
  copySqliteFamily,
  findExistingPath,
  getCanonicalDataDir,
  getCanonicalDevhubDir,
  getLegacyDbCandidates,
  getNewestMtimeMs,
  resolveDbPath,
};
