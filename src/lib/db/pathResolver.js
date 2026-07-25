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

const PRODUCTION_SIDECAR_PORT = 4000;
const DEVELOPMENT_SIDECAR_PORT = 4001;

function isDevhubDevelopmentHome(dirPath) {
  if (!dirPath) return false;
  const normalized = path.resolve(dirPath).replace(/\\/g, '/');
  return normalized.endsWith('/.devhub-dev') || normalized.endsWith('\\.devhub-dev');
}

function readSidecarPortMarker(dirPath) {
  const portFile = path.join(dirPath, 'sidecar-port.txt');
  if (!fs.existsSync(/*turbopackIgnore: true*/ portFile)) return null;
  const port = Number(fs.readFileSync(/*turbopackIgnore: true*/ portFile, 'utf8').trim());
  return Number.isInteger(port) && port > 0 ? port : null;
}

/**
 * True when this Node process is part of the dev runtime (not the installed app).
 * Do NOT infer dev home from ~/.devhub-dev marker files alone — that breaks
 * coexistence when the installed app runs while dev markers exist on disk.
 */
function isDevhubDevelopmentRuntime(env = process.env) {
  if (env.DEVHUB_HOME && isDevhubDevelopmentHome(env.DEVHUB_HOME)) return true;
  if (env.DEVHUB_RUNTIME === 'development') return true;
  if (String(env.PORT || '') === '3100') return true;
  if (String(env.SIDECAR_PORT || '') === '4001') return true;
  return false;
}

function getCanonicalDevhubDir({ env = process.env, homeDir = os.homedir() } = {}) {
  if (env.DEVHUB_HOME) {
    return ensureDirectory(path.resolve(env.DEVHUB_HOME));
  }

  const productionDir = path.join(/*turbopackIgnore: true*/ homeDir, '.devhub');
  const developmentDir = path.join(/*turbopackIgnore: true*/ homeDir, '.devhub-dev');

  if (isDevhubDevelopmentRuntime(env)) {
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
    findExistingPath(cwd, 'devhub-mcp', 'data', 'devhub.db'),
    findExistingPath(moduleDir, 'devhub-mcp', 'data', 'devhub.db'),
    findExistingPath(cwd, 'data', 'devhub.db'),
    findExistingPath(moduleDir, 'data', 'devhub.db'),
    findExistingPath(cwd, '.next', 'standalone', 'data', 'devhub.db'),
    findExistingPath(moduleDir, '.next', 'standalone', 'data', 'devhub.db'),
    path.join(homeDir, '.devhub-dev', 'data', 'devhub.db'),
    path.join(homeDir, '.devhub', 'data', 'devhub.db'),
    path.join(homeDir, '.devhub', 'standalone', 'data', 'devhub.db'),
    path.join(homeDir, '.devhub', 'devhub.db'),
  ]).filter((candidate) => fs.existsSync(candidate));
}

function hasProjectsInDb(dbPath) {
  if (!fs.existsSync(dbPath)) return false;
  try {
    const stat = fs.statSync(dbPath);
    if (stat.size < 100) return false;
    const fd = fs.openSync(dbPath, 'r');
    const buf = Buffer.alloc(16);
    fs.readSync(fd, buf, 0, 16, 0);
    fs.closeSync(fd);
    if (buf.toString('utf8', 0, 15) !== 'SQLite format 3') return false;

    const Database = require('better-sqlite3');
    const tempDb = new Database(dbPath, { readonly: true, fileMustExist: true });
    let count = 0;
    try {
      count = tempDb.prepare('SELECT count(*) as c FROM projects').get().c;
    } catch {
      /* table may not exist */
    }
    tempDb.close();
    return count > 0;
  } catch {
    return false;
  }
}

function getLegacyDbScore(dbPath) {
  if (!fs.existsSync(dbPath)) return 0;
  try {
    const stat = fs.statSync(dbPath);
    if (stat.size < 100) return 0;
    const fd = fs.openSync(dbPath, 'r');
    const buf = Buffer.alloc(16);
    fs.readSync(fd, buf, 0, 16, 0);
    fs.closeSync(fd);
    if (buf.toString('utf8', 0, 15) !== 'SQLite format 3') return 0;

    const Database = require('better-sqlite3');
    const tempDb = new Database(dbPath, { readonly: true, fileMustExist: true });
    const pCount = tempDb.prepare('SELECT count(*) as c FROM projects').get().c;
    let tCount = 0;
    try {
      tCount = tempDb.prepare('SELECT count(*) as c FROM tasks').get().c;
    } catch {
      /* table may not exist */
    }
    tempDb.close();
    return pCount * 1000 + tCount;
  } catch {
    return 0;
  }
}

function isDevCanonicalDbPath(canonicalDbPath, homeDir = os.homedir()) {
  const devDataDir = path.join(homeDir, '.devhub-dev', 'data');
  return path.resolve(path.dirname(canonicalDbPath)) === path.resolve(devDataDir);
}

function getProductionDbPath(homeDir = os.homedir()) {
  return path.join(homeDir, '.devhub', 'data', 'devhub.db');
}

function maybeMigrateLegacyDb(canonicalDbPath, options = {}) {
  if (hasProjectsInDb(canonicalDbPath)) {
    const currentScore = getLegacyDbScore(canonicalDbPath);
    const legacyCandidates = getLegacyDbCandidates(options).filter(
      (candidate) =>
        path.resolve(candidate) !== path.resolve(canonicalDbPath) &&
        fs.existsSync(candidate) &&
        fs.statSync(candidate).size > 0
    );
    const populatedCandidates = legacyCandidates.filter((cand) => hasProjectsInDb(cand));
    if (populatedCandidates.length > 0) {
      const bestCandidate = populatedCandidates.sort(
        (left, right) => getLegacyDbScore(right) - getLegacyDbScore(left)
      )[0];
      if (getLegacyDbScore(bestCandidate) > currentScore) {
        console.log(
          `[pathResolver] Upgrading DB with richer candidate (${getLegacyDbScore(bestCandidate)} tasks/projects) from ${bestCandidate} to ${canonicalDbPath}`
        );
        copySqliteFamily(bestCandidate, canonicalDbPath);
        return canonicalDbPath;
      }
    }
    return canonicalDbPath;
  }

  const legacyCandidates = getLegacyDbCandidates(options).filter(
    (candidate) =>
      path.resolve(candidate) !== path.resolve(canonicalDbPath) &&
      fs.existsSync(candidate) &&
      fs.statSync(candidate).size > 0
  );

  if (legacyCandidates.length === 0) {
    return canonicalDbPath;
  }

  const populatedCandidates = legacyCandidates.filter((cand) => hasProjectsInDb(cand));
  const pool = populatedCandidates.length > 0 ? populatedCandidates : legacyCandidates;

  const newestLegacyDbPath = pool.sort((left, right) => {
    const scoreDiff = getLegacyDbScore(right) - getLegacyDbScore(left);
    if (scoreDiff !== 0) return scoreDiff;
    return getNewestMtimeMs(right) - getNewestMtimeMs(left);
  })[0];

  console.log(
    `[pathResolver] Restoring populated DB from ${newestLegacyDbPath} to ${canonicalDbPath}`
  );
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

  // Do not overwrite a dev DB that has more tasks/projects than the production DB
  if (getLegacyDbScore(canonicalDbPath) > getLegacyDbScore(productionDbPath)) {
    return false;
  }

  const productionStat = fs.statSync(productionDbPath);
  const canonicalStat = fs.statSync(canonicalDbPath);

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

  let dbPath;
  if (env.DEVHUB_DB_PATH) {
    dbPath = path.resolve(env.DEVHUB_DB_PATH);
    ensureDirectory(path.dirname(dbPath));
  } else if (env.NODE_ENV === 'test' && !options.forceCanonicalInTests) {
    dbPath = path.join(options.cwd || process.cwd(), 'data', 'devhub.db');
    ensureDirectory(path.dirname(dbPath));
    return dbPath;
  } else {
    dbPath = path.join(getCanonicalDataDir(options), 'devhub.db');
    ensureDirectory(path.dirname(dbPath));
  }

  maybeMigrateLegacyDb(dbPath, options);
  maybeSyncDevDatabaseFromProduction(dbPath, options);
  return dbPath;
}

module.exports = {
  DEVELOPMENT_SIDECAR_PORT,
  PRODUCTION_SIDECAR_PORT,
  isDevhubDevelopmentHome,
  isDevhubDevelopmentRuntime,
  readSidecarPortMarker,
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
  hasProjectsInDb,
};
