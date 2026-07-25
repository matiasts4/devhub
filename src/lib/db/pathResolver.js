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

const SQLITE_COPY_ATTEMPTS = 4;
const SQLITE_COPY_RETRY_DELAY_MS = 200;

function sleepSync(ms) {
  // resolveDbPath runs in a sync module-load context; a short bounded wait
  // between copy retries is acceptable (cold start only).
  const sab = new SharedArrayBuffer(4);
  const int32 = new Int32Array(sab);
  Atomics.wait(int32, 0, 0, ms);
}

/**
 * Copy with a small retry loop: on Windows a live WAL writer can hold
 * transient locks on sqlite family files (EBUSY/EPERM/UNKNOWN copyfile).
 * Returns true on success, false after all attempts (never throws).
 */
function copyFileWithRetries(sourcePath, targetPath, attempts = SQLITE_COPY_ATTEMPTS) {
  let lastError = null;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      fs.copyFileSync(sourcePath, targetPath);
      return true;
    } catch (err) {
      lastError = err;
      if (attempt < attempts) sleepSync(SQLITE_COPY_RETRY_DELAY_MS);
    }
  }
  console.warn(
    `[pathResolver] copy failed after ${attempts} attempts: ${sourcePath} → ${targetPath}: ${lastError?.message}`
  );
  return false;
}

function copySqliteFamily(sourceDbPath, targetDbPath) {
  ensureDirectory(path.dirname(targetDbPath));

  const [sourceDb, sourceWal] = sqliteFamilyPaths(sourceDbPath);
  const [targetDb, targetWal, targetShm] = sqliteFamilyPaths(targetDbPath);

  // The main .db file is the source of truth. If it cannot be copied at all,
  // the family copy fails — callers treat migrations as best-effort.
  const dbCopied = copyFileWithRetries(sourceDb, targetDb);
  if (!dbCopied) {
    throw new Error(`copySqliteFamily: unable to copy ${sourceDb} → ${targetDb}`);
  }

  // -wal is best-effort: it only carries un-checkpointed frames. A torn or
  // partial WAL at the target is worse than none — remove on failure.
  if (fs.existsSync(sourceWal)) {
    const walCopied = copyFileWithRetries(sourceWal, targetWal, 2);
    if (!walCopied && fs.existsSync(/*turbopackIgnore: true*/ targetWal)) {
      fs.rmSync(/*turbopackIgnore: true*/ targetWal, { force: true });
    }
  } else if (fs.existsSync(/*turbopackIgnore: true*/ targetWal)) {
    fs.rmSync(/*turbopackIgnore: true*/ targetWal, { force: true });
  }

  // -shm is NEVER copied: it is a shared-memory index that SQLite rebuilds on
  // open. A stale one at the target is invalid by definition (and copying it
  // raced live writers — the original 500-producing bug).
  if (fs.existsSync(/*turbopackIgnore: true*/ targetShm)) {
    fs.rmSync(/*turbopackIgnore: true*/ targetShm, { force: true });
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

  // Migration/sync are best-effort optimizations: a transient lock or IO error
  // on a candidate DB must never take down the API (observed as 500s on
  // /api/db/query when the -shm copy raced a live WAL writer on Windows).
  try {
    maybeMigrateLegacyDb(dbPath, options);
    maybeSyncDevDatabaseFromProduction(dbPath, options);
  } catch (err) {
    console.warn(`[pathResolver] DB migration/sync skipped: ${err?.message || err}`);
  }
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
