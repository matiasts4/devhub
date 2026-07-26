import fs from 'fs';
import path from 'path';
import { NextResponse } from 'next/server';
import { getTTYSessionsSnapshot } from '@/lib/terminal/ttyServer';
import { tables } from '@/lib/db/localDb';
import { getOpenCodeProcesses } from '@/lib/swarm/openCodeProcesses';
import {
  createRuntimeDiagnosticsSnapshot,
  detectQuotaSignals,
  extractErrorLines,
  listTmuxSessionNames,
} from '@/lib/swarm/runtimeStatus';

export const dynamic = 'force-dynamic';

function safeReadRecentFile(filePath) {
  try {
    if (!fs.existsSync(filePath)) return '';
    const raw = fs.readFileSync(filePath, 'utf8');
    const lines = raw.split('\n');
    return lines.slice(-200).join('\n');
  } catch {
    return '';
  }
}

function buildRuntimeEvidenceRefs({ hasTerminalLog, hasBrowserLog, opencodeLogName, crashDumps }) {
  const refs = [];

  if (hasTerminalLog) refs.push('log://terminal-debug.log:data/logs/terminal-debug.log');
  if (hasBrowserLog) refs.push('log://browser.log:data/logs/browser.log');
  if (opencodeLogName) refs.push(`log://${opencodeLogName}:data/logs/${opencodeLogName}`);

  (crashDumps || []).forEach((dump) => {
    if (!dump?.file) return;
    refs.push(`crashdump://${dump.file}:data/logs/crash-dumps/${dump.file}`);
  });

  return refs;
}

function findMostRecentOpencodeLog(logDir) {
  try {
    if (!fs.existsSync(logDir)) return null;
    const files = fs
      .readdirSync(logDir)
      .filter((name) => /^opencode_.*\.log$/.test(name))
      .map((name) => {
        const fullPath = path.join(logDir, name);
        return { name, fullPath, mtimeMs: fs.statSync(fullPath).mtimeMs };
      })
      .sort((a, b) => b.mtimeMs - a.mtimeMs);
    return files.length > 0 ? files[0] : null;
  } catch {
    return null;
  }
}

function readRecentCrashDumps() {
  const crashDumpDir = path.join(process.cwd(), 'data', 'logs', 'crash-dumps');
  try {
    if (!fs.existsSync(crashDumpDir)) return [];

    const files = fs
      .readdirSync(crashDumpDir)
      .filter((name) => name.endsWith('.json'))
      .map((name) => {
        const fullPath = path.join(crashDumpDir, name);
        const mtimeMs = fs.statSync(fullPath).mtimeMs;
        return { name, fullPath, mtimeMs };
      })
      .sort((left, right) => right.mtimeMs - left.mtimeMs)
      .slice(0, 5);

    return files.map((entry) => {
      try {
        const payload = JSON.parse(fs.readFileSync(entry.fullPath, 'utf8'));
        return {
          file: entry.name,
          reason: payload?.reason || null,
          ts: payload?.ts || null,
          pid: payload?.pid || null,
        };
      } catch {
        return {
          file: entry.name,
          reason: 'invalid-json',
          ts: null,
          pid: null,
        };
      }
    });
  } catch {
    return [];
  }
}

function readDatabaseRows(tableOps, fallback = []) {
  try {
    return tableOps?.select ? tableOps.select({ limit: 200 }) : fallback;
  } catch {
    return fallback;
  }
}

export async function GET() {
  try {
    // Snapshot only — do not boot PTY just for health/diagnostics (was ~1/s ensureTTYServer).
    const terminalSessions = getTTYSessionsSnapshot();
    const swarmProcesses = getOpenCodeProcesses();
    const agentRegistry = readDatabaseRows(tables?.agent_registry, []);
    const agentRuns = readDatabaseRows(tables?.agent_runs, []);
    const swarmMissions = readDatabaseRows(tables?.swarm_missions, []);
    const agentWorkspaces = readDatabaseRows(tables?.agent_workspaces, []);
    const supervisorSnapshots = readDatabaseRows(tables?.supervisor_snapshots, []);
    const crashDumps = readRecentCrashDumps();

    const terminalLogPath = path.join(process.cwd(), 'data', 'logs', 'terminal-debug.log');
    const browserLogPath = path.join(process.cwd(), 'data', 'logs', 'browser.log');
    const logDir = path.join(process.cwd(), 'data', 'logs');
    const recentOpencodeLog = findMostRecentOpencodeLog(logDir);
    const opencodeLogPath = recentOpencodeLog?.fullPath || null;
    const hasTerminalLog = fs.existsSync(terminalLogPath);
    const hasBrowserLog = fs.existsSync(browserLogPath);

    const terminalLog = safeReadRecentFile(terminalLogPath);
    const browserLog = safeReadRecentFile(browserLogPath);
    const opencodeLog = safeReadRecentFile(opencodeLogPath);
    const logSignals = detectQuotaSignals({ terminalLog, browserLog, opencodeLog });
    const errorLines = extractErrorLines({ terminalLog, browserLog, opencodeLog });

    const snapshot = createRuntimeDiagnosticsSnapshot({
      terminalSessions,
      swarmProcesses,
      agentRegistry,
      agentRuns,
      swarmMissions,
      crashDumps,
      logSignals,
      errorLines,
      agentWorkspaces,
      supervisorSnapshots,
      tmuxSessions: listTmuxSessionNames(),
    });

    snapshot.evidence_refs = buildRuntimeEvidenceRefs({
      hasTerminalLog,
      hasBrowserLog,
      opencodeLogName: recentOpencodeLog?.name || null,
      crashDumps,
    });

    return NextResponse.json(snapshot);
  } catch (error) {
    return NextResponse.json(
      {
        error: error?.message || 'No se pudo crear el diagnóstico unificado de runtime.',
      },
      { status: 500 }
    );
  }
}
