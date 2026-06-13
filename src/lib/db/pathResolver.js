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
  if (env.DEVHUB_HOME) {
    return ensureDirectory(path.resolve(env.DEVHUB_HOME));
  }

  const productionDir = path.join(homeDir, '.devhub');
  const developmentDir = path.join(homeDir, '.devhub-dev');
  const devSidecarPortFile = path.join(developmentDir, 'sidecar-port.txt');
  const devSidecarPidFile = path.join(developmentDir, 'sidecar.pid');

  // Tauri dev spawns the sidecar with ~/.devhub-dev; Next dev must read the same home.
  if (fs.existsSync(devSidecarPortFile) || fs.existsSync(devSidecarPidFile)) {
    return ensureDirectory(developmentDir);
  }

  return ensureDirectory(productionDir);
}

function getCanonicalDataDir(options = {}) {
  const { env = process.env } = options;
  const explicitDataDir = env.DEVHUB_DATA_DIR
    ? path.resolve(env.DEVHUB_DATA_DIR)
    : path.join(getCanonicalDevhubDir(options), 'data');
  return ensureDirectory(explicitDataDir);
}

function getLegacyDbCandidates({
  cwd = process.cwd(),
  moduleDir = __dirname,
  homeDir = os.homedir(),
} = {}) {
  return uniquePaths([
    findExistingPath(cwd, 'data', 'devhub.db'),
    findExistingPath(moduleDir, 'data', 'devhub.db'),
    findExistingPath(cwd, '.next', 'standalone', 'data', 'devhub.db'),
    findExistingPath(moduleDir, '.next', 'standalone', 'data', 'devhub.db'),
    path.join(homeDir, '.devhub', 'data', 'devhub.db'),
    path.join(homeDir, '.devhub', 'standalone', 'data', 'devhub.db'),
    path.join(homeDir, '.devhub', 'devhub.db'),
  ]).filter((candidate) => fs.existsSync(candidate));
}

function isDevCanonicalDbPath(canonicalDbPath, homeDir = os.homedir()) {
  const devDataDir = path.join(homeDir, '.devhub-dev', 'data');
  return path.resolve(path.dirname(canonicalDbPath)) === path.resolve(devDataDir);
}

function getProductionDbPath(homeDir = os.homedir()) {
  return path.join(homeDir, '.devhub', 'data', 'devhub.db');
}

function maybeMigrateLegacyDb(canonicalDbPath, options = {}) {
  if (fs.existsSync(canonicalDbPath) && fs.statSync(canonicalDbPath).size > 0) {
    return canonicalDbPath;
  }

  const legacyCandidates = getLegacyDbCandidates(options).filter(
    (candidate) =>
      path.resolve(candidate) !== path.resolve(canonicalDbPath) && fs.statSync(candidate).size > 0
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

function getDbFileMtimeMs(dbPath) {
  if (!fs.existsSync(dbPath)) return 0;
  return fs.statSync(dbPath).mtimeMs;
}

function shouldRefreshDevDatabaseFromProduction(productionDbPath, canonicalDbPath) {
  if (!fs.existsSync(productionDbPath) || fs.statSync(productionDbPath).size === 0) {
    return false;
  }

  if (!fs.existsSync(canonicalDbPath) || fs.statSync(canonicalDbPath).size === 0) {
    return true;
  }

  const productionStat = fs.statSync(productionDbPath);
  const canonicalStat = fs.statSync(canonicalDbPath);

  // Compare the main DB file only — WAL/SHM activity in dev must not block syncing
  // a stale fixture DB when ~/.devhub/data has the real project catalog.
  if (productionStat.mtimeMs > canonicalStat.mtimeMs) {
    return true;
  }

  return productionStat.size > canonicalStat.size * 1.5;
}

function maybeSyncDevDatabaseFromProduction(canonicalDbPath, options = {}) {
  const homeDir = options.homeDir || os.homedir();
  if (!isDevCanonicalDbPath(canonicalDbPath, homeDir)) {
    return canonicalDbPath;
  }

  const productionDbPath = getProductionDbPath(homeDir);
  if (shouldRefreshDevDatabaseFromProduction(productionDbPath, canonicalDbPath)) {
    copySqliteFamily(productionDbPath, canonicalDbPath);
  }

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
  maybeMigrateLegacyDb(canonicalDbPath, options);
  maybeSyncDevDatabaseFromProduction(canonicalDbPath, options);
  return canonicalDbPath;
}

module.exports = {
  copySqliteFamily,
  findExistingPath,
  getCanonicalDataDir,
  getCanonicalDevhubDir,
  getLegacyDbCandidates,
  getDbFileMtimeMs,
  getNewestMtimeMs,
  getProductionDbPath,
  isDevCanonicalDbPath,
  maybeSyncDevDatabaseFromProduction,
  shouldRefreshDevDatabaseFromProduction,
  resolveDbPath,
};
