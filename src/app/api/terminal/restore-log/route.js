import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * POST/GET /api/terminal/restore-log
 *
 * Durable sink for client-side restore diagnostics (restoreDiagnostics.js).
 * The sessionStorage debug buffer dies with the app — exactly when restore
 * forensics are needed — so the client relays its restore decision trail here.
 *
 * Lines are appended as JSONL {ts, source:'client', event, ...details} to:
 *   $DEVHUB_HOME/logs/terminal-restore.jsonl        (installed app / wrapper)
 *   <cwd>/data/logs/terminal-restore.jsonl          (dev Next.js server)
 *
 * Rotation: at ~2MB the file is renamed to terminal-restore.1.jsonl (single
 * backup). Best-effort: fs failures never produce a 500.
 */

const MAX_LOG_BYTES = 2 * 1024 * 1024; // ~2MB
const LOG_FILE_NAME = 'terminal-restore.jsonl';
const BACKUP_FILE_NAME = 'terminal-restore.1.jsonl';
const MAX_GET_LINES = 1000;
const DEFAULT_GET_LINES = 200;

/** Resolved per request so tests can flip DEVHUB_HOME between cases. */
function resolveRestoreLogFile() {
  const dir = process.env.DEVHUB_HOME
    ? path.join(process.env.DEVHUB_HOME, 'logs')
    : path.join(process.cwd(), 'data', 'logs');
  return path.join(dir, LOG_FILE_NAME);
}

function rotateIfNeeded(file) {
  try {
    const stat = fs.statSync(file);
    if (stat.size < MAX_LOG_BYTES) return;
    const backup = path.join(path.dirname(file), BACKUP_FILE_NAME);
    try {
      // Windows rename fails when the target exists — remove the old backup.
      fs.rmSync(backup, { force: true });
    } catch {
      // best-effort
    }
    fs.renameSync(file, backup);
  } catch {
    // Missing file or fs hiccup — append will recreate it.
  }
}

function appendEntries(file, entries) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  rotateIfNeeded(file);
  const lines =
    entries
      .map((entry) =>
        JSON.stringify({
          ts: new Date().toISOString(),
          source: 'client',
          event: entry.event,
          ...entry.details,
        })
      )
      .join('\n') + '\n';
  fs.appendFileSync(file, lines);
}

function normalizeEntries(body) {
  const list = Array.isArray(body) ? body : [body];
  return list
    .map((item) => ({
      event: typeof item?.event === 'string' && item.event ? item.event : null,
      details: item?.details && typeof item.details === 'object' ? item.details : {},
    }))
    .filter((item) => item.event);
}

export async function POST(request) {
  try {
    const body = await request.json();
    const entries = normalizeEntries(body);
    if (entries.length > 0) {
      appendEntries(resolveRestoreLogFile(), entries);
    }
    return NextResponse.json({ ok: true, appended: entries.length });
  } catch {
    // Never fail a diagnostics write — restore forensics are best-effort.
    return NextResponse.json({ ok: false });
  }
}

export async function GET(request) {
  try {
    const url = new URL(request?.url || '/', 'http://localhost');
    const parsed = parseInt(url.searchParams.get('n') || '', 10);
    const n = Number.isFinite(parsed)
      ? Math.min(Math.max(parsed, 1), MAX_GET_LINES)
      : DEFAULT_GET_LINES;

    let raw = '';
    try {
      raw = fs.readFileSync(resolveRestoreLogFile(), 'utf8');
    } catch {
      return NextResponse.json({ lines: [] });
    }

    const lines = [];
    for (const line of raw.split('\n')) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      try {
        lines.push(JSON.parse(trimmed));
      } catch {
        // Tolerate corrupt lines — a partial write must not hide the rest.
      }
    }

    return NextResponse.json({ lines: lines.slice(-n) });
  } catch {
    return NextResponse.json({ lines: [] });
  }
}
