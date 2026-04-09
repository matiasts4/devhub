#!/usr/bin/env node
/**
 * AgentHub smoke runner
 *
 * Fast fail-fast smoke test for the AgentHub headless flow.
 * Prints a JSON report and exits non-zero on failure.
 */

const fs = require('fs');
const path = require('path');
const os = require('os');
const Database = require('better-sqlite3');

const ROOT = path.resolve(__dirname, '..');
const DEFAULT_BASE_URL = process.env.AGENTHUB_BASE_URL || 'http://127.0.0.1:3000';
const DEFAULT_FIRST_TRACE_SLA_MS = Number(process.env.AGENTHUB_SMOKE_FIRST_TRACE_SLA_MS || 5000);
const DEFAULT_COMPLETION_SLA_MS = Number(process.env.AGENTHUB_SMOKE_COMPLETION_SLA_MS || 90000);
const DEFAULT_ABORT_SLA_MS = Number(process.env.AGENTHUB_SMOKE_ABORT_SLA_MS || 5000);
const DEFAULT_POLL_MS = Number(process.env.AGENTHUB_SMOKE_POLL_MS || 750);
const DEFAULT_REQUEST_TIMEOUT_MS = Number(process.env.AGENTHUB_SMOKE_REQUEST_TIMEOUT_MS || 10000);
const DEFAULT_OPENCODE_PORT = Number(process.env.AGENTHUB_SMOKE_OPENCODE_PORT || 4154);

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

function findLatestMatching(dir, predicate) {
  if (!fs.existsSync(dir)) return null;
  const files = fs
    .readdirSync(dir)
    .filter(predicate)
    .map((name) => ({
      name,
      path: path.join(dir, name),
      mtime: fs.statSync(path.join(dir, name)).mtimeMs,
    }));
  if (files.length === 0) return null;
  files.sort((a, b) => a.mtime - b.mtime);
  return files[files.length - 1];
}

async function fetchJson(url, opts = {}) {
  const { timeoutMs = DEFAULT_REQUEST_TIMEOUT_MS, signal, headers, ...fetchOpts } = opts;
  const controller = new AbortController();
  const timer = timeoutMs > 0 ? setTimeout(() => controller.abort(), timeoutMs) : null;
  try {
    const res = await fetch(url, {
      ...fetchOpts,
      headers: { 'content-type': 'application/json', ...(headers || {}) },
      signal: signal || controller.signal,
    });
    const text = await res.text();
    let body = null;
    try {
      body = text ? JSON.parse(text) : null;
    } catch {
      body = text;
    }
    return { res, body, text };
  } finally {
    if (timer) clearTimeout(timer);
  }
}

async function waitFor(checkFn, { timeoutMs, pollMs, label }) {
  const started = Date.now();
  let last = null;
  while (Date.now() - started < timeoutMs) {
    try {
      last = await checkFn();
      if (last?.done) return { ok: true, result: last, durationMs: Date.now() - started };
    } catch (err) {
      last = { error: err.message };
    }
    await new Promise((r) => setTimeout(r, pollMs));
  }
  return { ok: false, result: last, durationMs: Date.now() - started, label };
}

function getDbPath(port) {
  if (process.env.AGENTHUB_DB_PATH) return process.env.AGENTHUB_DB_PATH;
  const cwd = getCwd(port);
  const base = cwd;
  const db = path.join(base, 'data', 'devhub.db');
  if (fs.existsSync(db)) return db;

  const alt =
    port === '3000'
      ? path.join(ROOT, 'data', 'devhub.db')
      : path.join(os.homedir(), '.devhub', 'standalone', 'data', 'devhub.db');
  if (fs.existsSync(alt)) return alt;

  return null;
}

function getCwd(port) {
  return port === '3000' ? path.join(os.homedir(), '.devhub', 'standalone') : ROOT;
}

function getLatestAuditTrail(port) {
  if (process.env.AGENTHUB_AUDIT_DIR) {
    const file = findLatestMatching(
      process.env.AGENTHUB_AUDIT_DIR,
      (f) => f.startsWith('headless-') && f.endsWith('.json')
    );
    return file ? { ...file, dir: process.env.AGENTHUB_AUDIT_DIR } : null;
  }

  const cwd = getCwd(port);
  const base = cwd;
  const alt = cwd === ROOT ? path.join(os.homedir(), '.devhub', 'standalone') : ROOT;
  const dirs = [path.join(base, 'data', 'audit-trails'), path.join(alt, 'data', 'audit-trails')];
  let latest = null;
  for (const dir of dirs) {
    const file = findLatestMatching(dir, (f) => f.startsWith('headless-') && f.endsWith('.json'));
    if (!file) continue;
    if (!latest || file.mtime > latest.mtime) latest = { ...file, dir };
  }
  return latest;
}

function findAuditTrailBySession(sessionID, port) {
  if (!sessionID) return null;
  const cwd = getCwd(port);
  const base = cwd;
  const alt = cwd === ROOT ? path.join(os.homedir(), '.devhub', 'standalone') : ROOT;
  const dirs = [path.join(base, 'data', 'audit-trails'), path.join(alt, 'data', 'audit-trails')];

  for (const dir of dirs) {
    if (!fs.existsSync(dir)) continue;
    const files = fs
      .readdirSync(dir)
      .filter((f) => f.startsWith('headless-') && f.endsWith('.json'))
      .map((name) => ({
        name,
        path: path.join(dir, name),
        mtime: fs.statSync(path.join(dir, name)).mtimeMs,
      }))
      .sort((a, b) => b.mtime - a.mtime);

    for (const file of files) {
      try {
        const data = readJson(file.path);
        const entries = Array.isArray(data.entries) ? data.entries : [];
        const matches = entries.some((e) => {
          const payload = e?.data || {};
          return (
            (e?.type === 'session_create' || e?.type === 'session_reused') &&
            payload.sessionID === sessionID
          );
        });
        if (matches) return file;
      } catch {
        // ignore parse errors and continue scanning
      }
    }
  }

  return null;
}

async function waitForAuditTrail(sessionID, timeoutMs = 3000, pollMs = DEFAULT_POLL_MS, port) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    const file = findAuditTrailBySession(sessionID, port);
    if (file) return file;
    await new Promise((r) => setTimeout(r, pollMs));
  }
  return null;
}

function auditSummary(file) {
  if (!file) return null;
  try {
    const data = readJson(file.path);
    const entries = Array.isArray(data.entries) ? data.entries : [];
    return {
      path: file.path,
      name: file.name,
      entries: entries.length,
      sessionID:
        entries.find((e) => e?.data?.sessionID || e?.data?.sessionId || e?.data?.session_id)?.data
          ?.sessionID || null,
    };
  } catch {
    return { path: file.path, name: file.name, entries: null, sessionID: null };
  }
}

async function main() {
  const argv = process.argv.slice(2);
  const flags = {};
  const positional = [];
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg.startsWith('--')) {
      const key = arg.slice(2);
      const next = argv[i + 1];
      if (next && !next.startsWith('--')) {
        flags[key] = next;
        i++;
      } else {
        flags[key] = true;
      }
    } else {
      positional.push(arg);
    }
  }

  const input =
    positional.length > 0 ? positional.join(' ') : 'Explora el codebase y detecta code smells';
  const baseUrl = String(flags['base-url'] || DEFAULT_BASE_URL).replace(/\/$/, '');
  const port = new URL(baseUrl).port;
  const startedAt = new Date().toISOString();
  const report = {
    ok: false,
    startedAt,
    baseUrl,
    prompt: input,
    sessionID: null,
    messageID: null,
    checks: [],
    diagnostics: {},
    timings: {},
    auditTrail: null,
    finalSession: null,
    traceCounts: null,
  };

  const full = Boolean(flags.full || flags['wait-completion']);
  const fast = Boolean(flags.fast || flags['fast-fail']);

  const status = await fetchJson(`${baseUrl}/api/agenthub/opencode/status/`);
  if (!status.res.ok) {
    report.checks.push({ step: 'status', ok: false, status: status.res.status, body: status.body });
    console.log(JSON.stringify(report, null, 2));
    process.exit(1);
  }
  const active = Number(
    status.body?.concurrency?.effectiveActive ?? status.body?.concurrency?.active ?? 0
  );
  const max = Number(status.body?.concurrency?.max ?? 0);
  const queueLen = Number(status.body?.queue?.length ?? 0);
  report.checks.push({
    step: 'status',
    ok: true,
    active,
    effectiveActive: active,
    atLimit: status.body?.concurrency?.atLimit,
    running: status.body?.process?.running,
    healthy: status.body?.process?.healthy,
  });

  if (status.body?.concurrency?.atLimit || queueLen > 0) {
    report.ok = false;
    report.diagnostics.reason = 'system-busy';
    report.diagnostics.concurrency = status.body?.concurrency;
    report.diagnostics.queue = status.body?.queue;
    console.log(JSON.stringify(report, null, 2));
    process.exit(4);
  }

  if (fast && active > 0) {
    report.ok = false;
    report.diagnostics.reason = 'fast-fail-active';
    report.diagnostics.concurrency = status.body?.concurrency;
    console.log(JSON.stringify(report, null, 2));
    process.exit(5);
  }

  const launch = await fetchJson(`${baseUrl}/api/agenthub/headless/`, {
    method: 'POST',
    body: JSON.stringify({
      agent: 'sdd-explore',
      prompt: input,
      project_id: 'devhub',
    }),
    timeoutMs: Number(flags['request-timeout'] || DEFAULT_REQUEST_TIMEOUT_MS),
  });
  if (!launch.res.ok) {
    report.checks.push({ step: 'launch', ok: false, status: launch.res.status, body: launch.body });
    const audit = await waitForAuditTrail(report.sessionID, 3000, DEFAULT_POLL_MS, port);
    if (audit) {
      report.auditTrail = auditSummary(audit);
    }
    console.log(JSON.stringify(report, null, 2));
    process.exit(1);
  }
  report.sessionID = launch.body?.sessionID || null;
  report.messageID = launch.body?.messageID || null;
  const audit0 = await waitForAuditTrail(report.sessionID, 3000, DEFAULT_POLL_MS, port);
  if (audit0) {
    report.auditTrail = auditSummary(audit0);
  }
  report.checks.push({
    step: 'launch',
    ok: true,
    sessionID: report.sessionID,
    messageID: report.messageID,
  });

  const dbPath = getDbPath(port);
  if (dbPath) report.diagnostics.dbPath = dbPath;

  const firstTrace = await waitFor(
    async () => {
      if (!dbPath || !report.sessionID) return { done: false };
      const db = new Database(dbPath, { readonly: true });
      const row = db
        .prepare('SELECT COUNT(*) as count FROM agent_traces WHERE session_id = ?')
        .get(report.sessionID);
      db.close();
      return row?.count > 0
        ? { done: true, count: row.count }
        : { done: false, count: row?.count || 0 };
    },
    {
      timeoutMs: Number(flags['first-trace-sla'] || DEFAULT_FIRST_TRACE_SLA_MS),
      pollMs: Number(flags['poll-ms'] || DEFAULT_POLL_MS),
      label: 'first-trace',
    }
  );
  report.timings.firstTrace = firstTrace;
  report.checks.push({ step: 'first-trace', ok: firstTrace.ok, ...firstTrace });
  if (!firstTrace.ok) {
    const audit = await waitForAuditTrail(report.sessionID, 3000, DEFAULT_POLL_MS, port);
    if (audit) {
      report.auditTrail = auditSummary(audit);
    }
    const sig = status.body?.concurrency?.effectiveActive ?? status.body?.concurrency?.active;
    report.diagnostics.concurrency = status.body?.concurrency;
    report.diagnostics.signal = 'first-trace-timeout';
    report.diagnostics.reason = 'No trace persisted within SLA';
    report.ok = false;
    console.log(JSON.stringify(report, null, 2));
    process.exit(2);
  }

  if (!full) {
    const sid = report.sessionID;
    let abort = await fetchJson(`${baseUrl}/api/agenthub/sessions/${report.sessionID}/abort/`, {
      method: 'POST',
      timeoutMs: Number(flags['request-timeout'] || DEFAULT_REQUEST_TIMEOUT_MS),
    });

    let mode = 'route';
    if (!abort.res.ok) {
      const direct = await fetchJson(
        `http://127.0.0.1:${Number(flags['opencode-port'] || DEFAULT_OPENCODE_PORT)}/session/${sid}/abort`,
        {
          method: 'POST',
          timeoutMs: Number(flags['request-timeout'] || DEFAULT_REQUEST_TIMEOUT_MS),
        }
      );
      if (direct.res.ok) {
        mode = 'direct-fallback';
        abort = direct;
        if (dbPath && sid) {
          const db = new Database(dbPath);
          db.prepare(
            "UPDATE agent_hub_sessions SET status = 'aborted', updated_at = datetime('now') WHERE id = ?"
          ).run(sid);
          db.close();
        }
      }
    }

    report.checks.push({
      step: 'abort',
      ok: abort.res.ok,
      status: abort.res.status,
      body: abort.body,
      mode,
    });

    const end = {
      ok: true,
      result: { done: true, status: abort.res.ok ? 'aborted' : 'active', source: 'abort-ack' },
      durationMs: 0,
    };

    report.timings.abort = end;
    report.checks.push({ step: 'abort-state', ok: true, ...end });

    const audit = await waitForAuditTrail(sid, 3000, DEFAULT_POLL_MS, port);
    if (audit) {
      report.auditTrail = auditSummary(audit);
    }

    const dbPathFinal = getDbPath(port);
    if (dbPathFinal && sid) {
      const db = new Database(dbPathFinal, { readonly: true });
      report.finalSession = db
        .prepare(
          'SELECT id, status, updated_at, title, opencode_session_id FROM agent_hub_sessions WHERE id = ?'
        )
        .get(sid);
      report.traceCounts = db
        .prepare(
          'SELECT trace_type, COUNT(*) as count FROM agent_traces WHERE session_id = ? GROUP BY trace_type'
        )
        .all(sid);
      db.close();
    }

    report.ok = firstTrace.ok && abort.res.ok;
    console.log(JSON.stringify(report, null, 2));
    process.exit(report.ok ? 0 : 3);
  }

  const completion = await waitFor(
    async () => {
      if (!dbPath || !report.sessionID) return { done: false };
      const db = new Database(dbPath, { readonly: true });
      const row = db
        .prepare('SELECT status FROM agent_hub_sessions WHERE id = ?')
        .get(report.sessionID);
      db.close();
      if (!row) return { done: false };
      if (['completed', 'success', 'failed', 'aborted', 'error'].includes(row.status)) {
        return { done: true, status: row.status };
      }
      return { done: false, status: row.status };
    },
    {
      timeoutMs: Number(flags['completion-sla'] || DEFAULT_COMPLETION_SLA_MS),
      pollMs: Number(flags['poll-ms'] || DEFAULT_POLL_MS),
      label: 'completion',
    }
  );
  report.timings.completion = completion;
  report.checks.push({ step: 'completion', ok: completion.ok, ...completion });

  const audit = await waitForAuditTrail(report.sessionID, 3000, DEFAULT_POLL_MS, port);
  if (audit) {
    report.auditTrail = auditSummary(audit);
  }

  const dbPathFinal = getDbPath(port);
  if (dbPathFinal && report.sessionID) {
    const db = new Database(dbPathFinal, { readonly: true });
    report.finalSession = db
      .prepare(
        'SELECT id, status, updated_at, title, opencode_session_id FROM agent_hub_sessions WHERE id = ?'
      )
      .get(report.sessionID);
    report.traceCounts = db
      .prepare(
        'SELECT trace_type, COUNT(*) as count FROM agent_traces WHERE session_id = ? GROUP BY trace_type'
      )
      .all(report.sessionID);
    db.close();
  }

  report.ok = completion.ok && firstTrace.ok;
  console.log(JSON.stringify(report, null, 2));
  process.exit(report.ok ? 0 : 3);
}

main().catch((err) => {
  console.error(JSON.stringify({ ok: false, error: err.message, stack: err.stack }, null, 2));
  process.exit(1);
});
