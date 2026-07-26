import { spawnSync } from 'child_process';

export const RUNTIME_STATUS = Object.freeze({
  ACTIVE: 'active',
  REATTACHABLE: 'reattachable',
  ORPHANED_PROCESS: 'orphaned-process',
  ORPHANED_TERMINAL: 'orphaned-terminal',
  STALE_REGISTRY: 'stale-registry',
  QUOTA_BLOCKED: 'quota-blocked',
  TERMINATED: 'terminated',
  UNKNOWN: 'unknown',
});

/**
 * Lists live tmux session names (`tmux list-sessions -F '#S'`).
 * Returns [] on win32, when tmux is unavailable, or on any tmux error —
 * never throws, so the diagnostics route cannot fail because of tmux.
 */
export function listTmuxSessionNames({ platform = process.platform } = {}) {
  if (platform === 'win32') return [];
  try {
    const result = spawnSync('tmux', ['list-sessions', '-F', '#S'], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    });
    if (result.error || result.status !== 0) return [];
    return String(result.stdout || '')
      .split('\n')
      .map((name) => name.trim())
      .filter(Boolean);
  } catch {
    return [];
  }
}

const QUOTA_PATTERNS = [/\b429\b/i, /GoUsageLimitError/i, /quota/i, /too many requests/i];

const ERROR_PATTERNS = [
  /\bERROR\b/i,
  /\bFATAL\b/i,
  /\bCRASH\b/i,
  /\bPANIC\b/i,
  /ws_abrupt_close/i,
  /ECONNREFUSED/i,
  /ETIMEDOUT/i,
  /ENOENT\b/i,
  /unhandled rejection/i,
  /segmentation fault/i,
];

const MAX_ERROR_LINES = 50;

export function extractErrorLines({ terminalLog = '', browserLog = '', opencodeLog = '' } = {}) {
  const sources = [
    { label: 'terminal', content: terminalLog },
    { label: 'browser', content: browserLog },
    { label: 'opencode', content: opencodeLog },
  ];

  const errors = [];

  for (const source of sources) {
    if (!source.content) continue;
    const lines = String(source.content).split('\n');
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      if (ERROR_PATTERNS.some((pattern) => pattern.test(trimmed))) {
        errors.push({ source: source.label, line: trimmed });
      }
    }
  }

  return errors.slice(-MAX_ERROR_LINES);
}

export function detectQuotaSignals({ terminalLog = '', browserLog = '', opencodeLog = '' } = {}) {
  const sources = [terminalLog, browserLog, opencodeLog].filter(Boolean);
  const quotaMatches = [];

  for (const source of sources) {
    const lines = String(source).split('\n');
    for (const line of lines) {
      if (QUOTA_PATTERNS.some((pattern) => pattern.test(line))) {
        quotaMatches.push(line.trim());
      }
    }
  }

  return {
    quotaBlocked: quotaMatches.length > 0,
    quotaMatches,
  };
}

function classifyTerminal({ terminal, hasMatchingProcess, quotaBlocked }) {
  if (quotaBlocked) return RUNTIME_STATUS.QUOTA_BLOCKED;
  if (!terminal) return RUNTIME_STATUS.UNKNOWN;
  if (terminal.alive && Number(terminal.socketCount || 0) === 0) return RUNTIME_STATUS.REATTACHABLE;
  if (terminal.alive) return RUNTIME_STATUS.ACTIVE;
  if (hasMatchingProcess) return RUNTIME_STATUS.ORPHANED_TERMINAL;
  return RUNTIME_STATUS.TERMINATED;
}

function classifyProcess({ process, hasTerminal: _hasTerminal, hasRegistryAgent, quotaBlocked }) {
  if (quotaBlocked) return RUNTIME_STATUS.QUOTA_BLOCKED;
  if (!process) return RUNTIME_STATUS.UNKNOWN;
  if (!hasRegistryAgent) return RUNTIME_STATUS.ORPHANED_PROCESS;
  return RUNTIME_STATUS.ACTIVE;
}

function classifyRegistry({ agent, hasProcess, hasActiveRun }) {
  if (!agent) return RUNTIME_STATUS.UNKNOWN;
  if (hasProcess) return RUNTIME_STATUS.ACTIVE;
  if (hasActiveRun) return RUNTIME_STATUS.ACTIVE;
  if (agent.status === 'idle') return RUNTIME_STATUS.STALE_REGISTRY;
  return RUNTIME_STATUS.UNKNOWN;
}

function countByStatus(entities = []) {
  return entities.reduce((acc, entity) => {
    const key = entity.status || RUNTIME_STATUS.UNKNOWN;
    acc[key] = (acc[key] || 0) + 1;
    return acc;
  }, {});
}

function buildDiagnosis({
  terminals,
  processes,
  registry,
  logSignals,
  crashDumps,
  errorLines,
  agentWorkspaces,
  supervisorSnapshots,
}) {
  const findings = [];
  const actions = [];

  if (logSignals?.quotaBlocked) {
    findings.push({
      severity: 'critical',
      code: 'QUOTA_BLOCKED',
      message:
        'OpenCode está bloqueado por cuota (429 / GoUsageLimitError). Los agentes no pueden responder hasta que se renueve la cuota.',
      detail: (logSignals.quotaMatches || []).slice(0, 3),
    });
    actions.push('Esperar renovación de cuota o cambiar modelo/provider.');
  }

  const reattachable = terminals.filter((t) => t.status === RUNTIME_STATUS.REATTACHABLE);
  if (reattachable.length > 0) {
    findings.push({
      severity: 'warning',
      code: 'TERMINALS_REATTACHABLE',
      message: `${reattachable.length} terminal(es) están vivas pero sin sockets conectados (alive=true, socketCount=0). La UI perdió la conexión WebSocket.`,
      detail: reattachable.map((t) => ({
        terminalId: t.terminalId,
        opencodeSessionId: t.opencodeSessionId,
      })),
    });
    actions.push('Reconectar WebSocket al terminalId correspondiente o hacer reattach del panel.');
  }

  const orphanedProcs = processes.filter((p) => p.status === RUNTIME_STATUS.ORPHANED_PROCESS);
  if (orphanedProcs.length > 0) {
    findings.push({
      severity: 'warning',
      code: 'ORPHANED_PROCESSES',
      message: `${orphanedProcs.length} proceso(s) OpenCode activos sin terminal asociada. Pueden ser procesos huérfanos de un reload o crash.`,
      detail: orphanedProcs.map((p) => ({ pid: p.pid, agent: p.agent, sessionId: p.sessionId })),
    });
    actions.push(
      'Verificar si el proceso corresponde a un panel cerrado. Si no, limpiar con kill.'
    );
  }

  const staleAgents = registry.filter((r) => r.status === RUNTIME_STATUS.STALE_REGISTRY);
  if (staleAgents.length > 0) {
    findings.push({
      severity: 'warning',
      code: 'STALE_REGISTRY',
      message: `${staleAgents.length} agente(s) en registry sin proceso activo pero con run activo o status idle. Metadata desfasada.`,
      detail: staleAgents.map((r) => ({ agentId: r.agentId, registryStatus: r.registryStatus })),
    });
    actions.push('Reconciliar registry con procesos reales o actualizar status del agente.');
  }

  const orphanedTerminals = terminals.filter((t) => t.status === RUNTIME_STATUS.ORPHANED_TERMINAL);
  if (orphanedTerminals.length > 0) {
    findings.push({
      severity: 'info',
      code: 'ORPHANED_TERMINALS',
      message: `${orphanedTerminals.length} terminal(es) PTY muertas pero con proceso OpenCode aún vivo.`,
      detail: orphanedTerminals.map((t) => ({ terminalId: t.terminalId })),
    });
  }

  const blockedWorkspaces = (agentWorkspaces || []).filter(
    (ws) => ws.status === 'conflicted' || ws.status === 'orphaned'
  );
  if (blockedWorkspaces.length > 0) {
    findings.push({
      severity: 'warning',
      code: 'BLOCKED_WORKSPACES',
      message: `${blockedWorkspaces.length} workspace(s) de agente en estado conflicted/orphaned.`,
      detail: blockedWorkspaces.map((ws) => ({
        workspaceId: ws.id,
        agentId: ws.agent_id,
        status: ws.status,
        lastError: ws.last_error || null,
      })),
    });
    actions.push('Revisar last_error del workspace y decidir cleanup o recovery.');
  }

  const blockedSupervisors = (supervisorSnapshots || []).filter(
    (s) =>
      s.supervisor_state === 'blocked' ||
      s.supervisor_state === 'awaiting_approval' ||
      s.supervisor_state === 'recovering_orphan'
  );
  if (blockedSupervisors.length > 0) {
    findings.push({
      severity: 'info',
      code: 'SUPERVISOR_BLOCKED',
      message: `${blockedSupervisors.length} tarea(s) con supervisor bloqueado, esperando aprobación o recuperando huérfano.`,
      detail: blockedSupervisors.map((s) => ({
        taskId: s.task_id,
        state: s.supervisor_state,
        reasonClass: s.reason_class,
        retryCount: s.task_retry_count,
      })),
    });
  }

  if (crashDumps && crashDumps.length > 0) {
    findings.push({
      severity: 'info',
      code: 'CRASH_DUMPS',
      message: `${crashDumps.length} crash dump(s) reciente(s). Revisar reason para causa raíz.`,
      detail: crashDumps.map((d) => ({
        file: d.file,
        reason: d.reason,
        ts: d.ts,
        pid: d.pid,
      })),
    });
  }

  const errorSources = new Set((errorLines || []).map((e) => e.source));
  if (errorSources.size > 0) {
    findings.push({
      severity: 'info',
      code: 'LOG_ERRORS',
      message: `Errores detectados en ${[...errorSources].join(', ')}. Ver errorLines para detalles.`,
    });
  }

  if (findings.length === 0) {
    findings.push({
      severity: 'ok',
      code: 'ALL_CLEAR',
      message: 'No se detectaron anomalías. Todos los componentes operan normalmente.',
    });
  }

  return { findings, actions };
}

export function createRuntimeDiagnosticsSnapshot({
  terminalSessions = [],
  swarmProcesses = [],
  agentRegistry = [],
  agentRuns = [],
  swarmMissions = [],
  crashDumps = [],
  logSignals = { quotaBlocked: false, quotaMatches: [] },
  errorLines = [],
  agentWorkspaces = [],
  supervisorSnapshots = [],
  tmuxSessions = [],
} = {}) {
  const processBySessionId = new Map(
    swarmProcesses.filter((entry) => entry?.sessionId).map((entry) => [entry.sessionId, entry])
  );
  const processAgentIds = new Set(swarmProcesses.map((entry) => entry?.agent).filter(Boolean));
  const registryAgentIds = new Set(
    agentRegistry.map((a) => a?.agent_id || a?.agentId).filter(Boolean)
  );
  const activeRunAgents = new Set(
    agentRuns
      .filter((run) => ['running', 'working', 'active', 'thinking'].includes(run?.status))
      .map((run) => run?.agent_id || run?.agentId)
      .filter(Boolean)
  );

  const terminals = terminalSessions.map((terminal) => {
    const matchingProcess = terminal?.opencodeSessionId
      ? processBySessionId.get(terminal.opencodeSessionId)
      : null;
    return {
      terminalId: terminal?.terminalId || terminal?.id || null,
      opencodeSessionId: terminal?.opencodeSessionId || null,
      status: classifyTerminal({
        terminal,
        hasMatchingProcess: Boolean(matchingProcess),
        quotaBlocked: Boolean(logSignals?.quotaBlocked),
      }),
      alive: Boolean(terminal?.alive),
      socketCount: Number(terminal?.socketCount || 0),
      reasons:
        terminal?.alive && Number(terminal?.socketCount || 0) === 0
          ? ['alive-without-sockets']
          : [],
    };
  });

  const processes = swarmProcesses.map((process) => {
    const hasTerminal = terminalSessions.some(
      (terminal) => terminal?.opencodeSessionId && terminal.opencodeSessionId === process?.sessionId
    );
    const hasRegistryAgent = process?.agent ? registryAgentIds.has(process.agent) : false;

    return {
      pid: process?.pid || null,
      sessionId: process?.sessionId || null,
      agent: process?.agent || null,
      status: classifyProcess({
        process,
        hasTerminal,
        hasRegistryAgent,
        quotaBlocked: Boolean(logSignals?.quotaBlocked),
      }),
      reasons: !hasTerminal ? ['process-without-terminal'] : [],
    };
  });

  const registry = agentRegistry.map((agent) => {
    const agentId = agent?.agent_id || agent?.agentId || null;
    const hasProcess = agentId ? processAgentIds.has(agentId) : false;
    const hasActiveRun = agentId ? activeRunAgents.has(agentId) : false;

    return {
      agentId,
      status: classifyRegistry({ agent, hasProcess, hasActiveRun }),
      registryStatus: agent?.status || null,
      reasons:
        !hasProcess && (hasActiveRun || agent?.status === 'idle') ? ['registry-out-of-sync'] : [],
    };
  });

  const diagnosis = buildDiagnosis({
    terminals,
    processes,
    registry,
    logSignals,
    crashDumps,
    errorLines,
    agentWorkspaces,
    supervisorSnapshots,
  });

  return {
    generatedAt: new Date().toISOString(),
    diagnosis,
    terminals,
    processes,
    registry,
    agentRuns,
    swarmMissions,
    agentWorkspaces,
    supervisorSnapshots,
    crashDumps,
    logSignals,
    errorLines,
    tmuxSessions: Array.isArray(tmuxSessions)
      ? tmuxSessions.filter((name) => typeof name === 'string' && name.trim())
      : [],
    anomalies: {
      reattachableTerminals: terminals
        .filter((entry) => entry.status === RUNTIME_STATUS.REATTACHABLE)
        .map((entry) => entry.terminalId)
        .filter(Boolean),
      orphanedProcesses: processes
        .filter((entry) => entry.status === RUNTIME_STATUS.ORPHANED_PROCESS)
        .map((entry) => entry.pid)
        .filter(Boolean),
      staleRegistryAgents: registry
        .filter((entry) => entry.status === RUNTIME_STATUS.STALE_REGISTRY)
        .map((entry) => entry.agentId)
        .filter(Boolean),
      quotaBlocked: Boolean(logSignals?.quotaBlocked),
      quotaMatches: Array.isArray(logSignals?.quotaMatches) ? logSignals.quotaMatches : [],
    },
    summary: {
      totalTerminals: terminals.length,
      totalProcesses: processes.length,
      totalRegistryAgents: registry.length,
      terminalStatusCounts: countByStatus(terminals),
      processStatusCounts: countByStatus(processes),
      registryStatusCounts: countByStatus(registry),
    },
  };
}
