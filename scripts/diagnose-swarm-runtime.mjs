/**
 * DevHub Swarm Runtime Diagnostic Script
 *
 * Usage: node scripts/diagnose-swarm-runtime.mjs
 *
 * Collects runtime state WITHOUT modifying the database.
 * Output is suitable for pasting into a bug report.
 */

import { execSync } from 'node:child_process';
import { readFileSync, existsSync, statSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function section(title) {
  console.log(`\n${'='.repeat(60)}`);
  console.log(`  ${title}`);
  console.log('='.repeat(60));
}

function kv(key, value) {
  console.log(`  ${key}: ${value}`);
}

function safeExec(cmd, label) {
  try {
    return execSync(cmd, { encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] }).trim();
  } catch (e) {
    return `[error: ${e.message.trim()}]`;
  }
}

function safeStat(filePath) {
  try {
    return statSync(filePath);
  } catch {
    return null;
  }
}

function formatBytes(bytes) {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
}

// ---------------------------------------------------------------------------
// 1. Node / OS info
// ---------------------------------------------------------------------------

section('Node / Platform');
kv('node', process.version);
kv('platform', process.platform);
kv('arch', process.arch);
kv('pid', process.pid);
kv('cwd', process.cwd());

// ---------------------------------------------------------------------------
// 2. better-sqlite3 version from package-lock.json
// ---------------------------------------------------------------------------

section('better-sqlite3 Version');

function findBetterSqlite3Version() {
  const lockPath = join(ROOT, 'package-lock.json');
  if (!existsSync(lockPath)) {
    return 'package-lock.json not found';
  }
  try {
    const lock = JSON.parse(readFileSync(lockPath, 'utf8'));
    // npm v2/v3 lock format
    const pkg = lock.packages?.['node_modules/better-sqlite3'];
    if (pkg?.version) return pkg.version;
    // npm v1 lock format
    const dep = lock.dependencies?.['better-sqlite3'];
    if (dep?.version) return dep.version;
    return 'not found in lockfile';
  } catch (e) {
    return `parse error: ${e.message}`;
  }
}

kv('better-sqlite3', findBetterSqlite3Version());

// ---------------------------------------------------------------------------
// 3. SQLite PRAGMAs (read-only)
// ---------------------------------------------------------------------------

section('SQLite PRAGMAs');

const DB_CANDIDATES = [
  join(ROOT, 'data', 'devhub.db'),
  join(process.env.HOME || '~', '.devhub', 'data', 'devhub.db'),
];

let dbPath = null;
for (const candidate of DB_CANDIDATES) {
  if (existsSync(candidate)) {
    dbPath = candidate;
    break;
  }
}

if (!dbPath) {
  console.log('  No devhub.db found in expected locations.');
  console.log('  Checked:');
  for (const c of DB_CANDIDATES) {
    console.log(`    - ${c}`);
  }
} else {
  kv('db_path', dbPath);

  // Use better-sqlite3 to read PRAGMAs (read-only mode)
  try {
    const Database = (await import('better-sqlite3')).default;
    const db = new Database(dbPath, { readonly: true, fileMustExist: true });

    const pragmas = ['journal_mode', 'foreign_keys', 'busy_timeout', 'synchronous'];
    for (const pragma of pragmas) {
      const result = db.pragma(pragma, { simple: true });
      kv(`PRAGMA ${pragma}`, result);
    }

    // Table counts
    const tables = db
      .prepare(
        "SELECT name FROM sqlite_master WHERE type='table' ORDER BY name"
      )
      .all()
      .map((r) => r.name);
    kv('tables_count', tables.length);
    kv('tables', tables.join(', '));

    // Row counts for key tables
    const keyTables = [
      'projects',
      'agent_workspaces',
      'agent_runs',
      'agent_presence',
      'swarm_missions',
      'mission_messages',
      'swarm_processes',
    ];
    for (const t of keyTables) {
      if (tables.includes(t)) {
        const count = db.prepare(`SELECT count(*) as c FROM ${t}`).get().c;
        kv(`  rows in ${t}`, count);
      }
    }

    db.close();
  } catch (e) {
    console.log(`  Error reading DB: ${e.message}`);
  }
}

// ---------------------------------------------------------------------------
// 4. WAL / SHM file sizes
// ---------------------------------------------------------------------------

section('WAL / SHM Files');

if (dbPath) {
  const walPath = `${dbPath}-wal`;
  const shmPath = `${dbPath}-shm`;

  const walStat = safeStat(walPath);
  const shmStat = safeStat(shmPath);

  kv('devhub.db-wal', walStat ? `${formatBytes(walStat.size)} (exists)` : 'not present');
  kv('devhub.db-shm', shmStat ? `${formatBytes(shmStat.size)} (exists)` : 'not present');
}

// ---------------------------------------------------------------------------
// 5. Running processes
// ---------------------------------------------------------------------------

section('Running Processes');

function countProcesses(pattern) {
  const result = safeExec(`pgrep -c -f "${pattern}" 2>/dev/null || echo 0`, pattern);
  return parseInt(result, 10) || 0;
}

const processPatterns = [
  ['node (next)', 'next'],
  ['node (tauri)', 'tauri'],
  ['opencode', 'opencode'],
  ['tmux', 'tmux'],
  ['codex', 'codex'],
  ['hermes', 'hermes'],
];

for (const [label, pattern] of processPatterns) {
  kv(label, countProcesses(pattern));
}

// ---------------------------------------------------------------------------
// 6. Git worktrees
// ---------------------------------------------------------------------------

section('Git Worktrees');

const worktreeOutput = safeExec('git worktree list --porcelain', 'git worktree list');
const worktreeLines = worktreeOutput.split('\n').filter((l) => l.startsWith('worktree '));
kv('total_worktrees', worktreeLines.length);

// Count DevHub worktrees specifically (normalize Windows `\` for substring match)
const asPosix = (line) => String(line || '').replace(/\\/g, '/');
const devhubWorktrees = worktreeLines.filter((l) => asPosix(l).includes('.devhub/worktrees'));
kv('devhub_worktrees', devhubWorktrees.length);

// Count Plyrium worktrees
const plyriumWorktrees = worktreeLines.filter((l) => asPosix(l).includes('.plyrium-forge'));
kv('plyrium_worktrees', plyriumWorktrees.length);

// ---------------------------------------------------------------------------
// 7. Swarm config
// ---------------------------------------------------------------------------

section('Swarm Config');

if (dbPath) {
  try {
    const Database = (await import('better-sqlite3')).default;
    const db = new Database(dbPath, { readonly: true, fileMustExist: true });

    if (db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='swarm_config'").get()) {
      const config = db.prepare('SELECT key, value FROM swarm_config').all();
      for (const row of config) {
        kv(row.key, row.value);
      }
    } else {
      console.log('  swarm_config table does not exist');
    }

    db.close();
  } catch (e) {
    console.log(`  Error reading swarm_config: ${e.message}`);
  }
}

// ---------------------------------------------------------------------------
// 8. Timestamp
// ---------------------------------------------------------------------------

section('Diagnostic Timestamp');
kv('generated_at', new Date().toISOString());
kv('script', 'scripts/diagnose-swarm-runtime.mjs');

console.log('\n  --- END OF DIAGNOSTIC ---\n');
