/**
 * Panel status helpers — map agent/connection states to a small visual vocabulary
 * shown in each terminal panel header.
 *
 * Vocabulary:
 *   running   → green pulsing dot  (the agent is actually doing work)
 *   active    → blue/accent dot    (agent/session connected and alive)
 *   waiting   → amber/yellow dot   (connecting, suspended, or blocked)
 *   blocked   → rose/pink dot      (agent waiting for user input/approval)
 *   idle      → gray dot           (connected but no agent activity)
 *   error     → red dot            (error, aborted, terminated, disconnected)
 *   completed → slate/blue dot     (finished successfully)
 *   unknown   → gray dot           (we don't know yet)
 */

import { AGENT_TUI_PATTERN, isAgentTuiCommand } from '@/lib/terminal/agentTuiMetadata';

export { AGENT_TUI_PATTERN };

export const PANEL_STATUS = {
  RUNNING: 'running',
  ACTIVE: 'active',
  WAITING: 'waiting',
  BLOCKED: 'blocked',
  IDLE: 'idle',
  ERROR: 'error',
  COMPLETED: 'completed',
  UNKNOWN: 'unknown',
};

const IN_PROGRESS_STATUSES = new Set(['running', 'working', 'thinking', 'busy']);
const BLOCKED_STATUSES = new Set(['blocked', 'awaiting_input', 'approval', 'needs_input']);

const ERROR_STATUSES = new Set(['error', 'aborted', 'failed']);
const COMPLETED_STATUSES = new Set(['completed', 'succeeded', 'done']);
const WAITING_STATUSES = new Set(['waiting', 'pending', 'paused']);

const DEFAULT_ACTIVITY_THRESHOLD_MS = 3000;
const AGENT_TUI_STATE_TTL_MS = 10000;
const LIVE_ACTIVITY_FALLBACK_MS = 10000;

/**
 * Normalize an arbitrary backend status string into one of the panel statuses.
 */
export function normalizePanelStatus(status) {
  const raw = String(status || '')
    .trim()
    .toLowerCase();
  if (!raw) return PANEL_STATUS.UNKNOWN;
  if (IN_PROGRESS_STATUSES.has(raw)) return PANEL_STATUS.RUNNING;
  if (BLOCKED_STATUSES.has(raw)) return PANEL_STATUS.BLOCKED;
  if (ERROR_STATUSES.has(raw)) return PANEL_STATUS.ERROR;
  if (COMPLETED_STATUSES.has(raw)) return PANEL_STATUS.COMPLETED;
  if (WAITING_STATUSES.has(raw)) return PANEL_STATUS.WAITING;
  if (raw === 'active') return PANEL_STATUS.ACTIVE;
  if (raw === 'idle') return PANEL_STATUS.IDLE;
  if (raw === 'connecting' || raw === 'suspended') return PANEL_STATUS.WAITING;
  if (raw === 'disconnected' || raw === 'terminated' || raw === 'agent-exited') {
    return PANEL_STATUS.ERROR;
  }
  return PANEL_STATUS.UNKNOWN;
}

/**
 * Determine whether a PTY session has recent output from the child process.
 *
 * Uses `lastOutputAt` when available so user keystrokes (which update
 * `lastActivityAt`) do not count as agent work. Falls back to `lastActivityAt`
 * for backward compatibility with older session snapshots.
 *
 * @param {object} options
 * @param {string|null} options.lastOutputAt - ISO timestamp of last PTY output
 * @param {string|null} options.lastActivityAt - ISO timestamp of last PTY input/output (legacy)
 * @param {number} [options.thresholdMs=3000] - activity freshness window
 */
export function isTerminalRecentlyActive(activity, thresholdMs = DEFAULT_ACTIVITY_THRESHOLD_MS) {
  if (!activity || typeof activity !== 'object') return false;
  const timestamp = activity.lastOutputAt || activity.lastActivityAt || null;
  if (!timestamp) return false;
  const last = new Date(timestamp).getTime();
  if (Number.isNaN(last)) return false;
  const effectiveThreshold = activity.thresholdMs != null ? activity.thresholdMs : thresholdMs;
  return (
    Date.now() - last <= Math.max(500, Number(effectiveThreshold) || DEFAULT_ACTIVITY_THRESHOLD_MS)
  );
}

/**
 * Derive a panel status from connection state and optional agent run metadata.
 *
 * Priority:
 *   1. PTY lifecycle (error / waiting).
 *   2. Real-time PTY activity (running / idle).
 *   3. API status as reinforcement when PTY is quiet.
 *   4. Agent metadata as a transitional fallback.
 *
 * @param {object} options
 * @param {string|null} options.connectionState - panel connection state from TerminalTTY
 * @param {object|null} options.agentRun - agent run metadata from devhub_agent_runs
 * @param {string|null} options.initialCommand - the panel's initial command
 * @param {string|null} options.apiStatus - latest status fetched from /api/agenthub/sessions/{id}/status
 * @param {object|null} options.terminalActivity - PTY activity metadata { lastActivityAt, lastActivityAgoMs, isActive, alive, agentType }
 * @param {('running'|'idle'|null)} [options.liveActivity] - real-time WS activity signal (event-driven)
 * @param {number|null} [options.liveActivityAgeMs] - ms since the live signal last changed to 'running' (substantial frame)
 */
export function derivePanelStatus({
  connectionState,
  agentRun,
  initialCommand,
  apiStatus,
  terminalActivity = null,
  liveActivity = null,
  liveActivityAgeMs = null,
}) {
  const normalizedConnection = normalizePanelStatus(connectionState);

  // Terminal-level lifecycle states always win — they reflect the real PTY state.
  if (normalizedConnection === PANEL_STATUS.ERROR) {
    return PANEL_STATUS.ERROR;
  }

  const isAgentPanel = Boolean(
    terminalActivity?.agentType || agentRun || AGENT_TUI_PATTERN.test(String(initialCommand || ''))
  );
  const hasRecentPtyOutput = isTerminalRecentlyActive(terminalActivity);

  const agentTuiStateAgeMs = terminalActivity?.agentTuiStateAgeMs ?? null;
  const agentTuiStateFresh =
    terminalActivity?.agentTuiState &&
    (agentTuiStateAgeMs === null || agentTuiStateAgeMs <= AGENT_TUI_STATE_TTL_MS);
  const semanticState = agentTuiStateFresh
    ? String(terminalActivity.agentTuiState).toLowerCase()
    : null;

  if (agentTuiStateFresh && BLOCKED_STATUSES.has(semanticState)) {
    return PANEL_STATUS.BLOCKED;
  }
  if (agentTuiStateFresh && IN_PROGRESS_STATUSES.has(semanticState)) {
    return PANEL_STATUS.RUNNING;
  }
  if (agentTuiStateFresh && (semanticState === 'idle' || semanticState === 'active')) {
    return PANEL_STATUS.IDLE;
  }

  const semanticStateKnown = agentTuiStateFresh && semanticState && semanticState !== 'unknown';

  // Byte-level WebSocket activity is only a liveness signal, not evidence of
  // real agent work. herdr-style manifests and API status are the authority.
  if (
    !semanticStateKnown &&
    liveActivity === 'idle' &&
    (liveActivityAgeMs === null || liveActivityAgeMs <= LIVE_ACTIVITY_FALLBACK_MS) &&
    isAgentPanel
  ) {
    return PANEL_STATUS.IDLE;
  }

  // In-progress API status (agenthub) is a strong signal even when PTY is quiet.
  if (apiStatus && IN_PROGRESS_STATUSES.has(String(apiStatus).toLowerCase())) {
    return PANEL_STATUS.RUNNING;
  }

  if (normalizedConnection === PANEL_STATUS.WAITING) {
    return PANEL_STATUS.WAITING;
  }

  // API terminal statuses (agenthub) are authoritative for the agent run state.
  // They win over generic PTY activity so that, e.g., a completed run is not
  // resurrected to running just because the user typed in the terminal.
  if (apiStatus) {
    const normalizedApi = normalizePanelStatus(apiStatus);
    if (normalizedApi !== PANEL_STATUS.UNKNOWN) {
      return normalizedApi;
    }
  }

  // Recent PTY output on an agent panel means the connection is alive, but it
  // does not prove the agent is working — the manifest would have said so above.
  if (hasRecentPtyOutput && isAgentPanel) {
    return PANEL_STATUS.IDLE;
  }

  // The PTY session is alive and associated with a known agent TUI → idle.
  if (terminalActivity?.alive && isAgentPanel) {
    return PANEL_STATUS.IDLE;
  }

  // Transitional fallback: we know this is an agent panel but haven't received PTY evidence yet.
  if (agentRun || isAgentTuiCommand(String(initialCommand || ''))) {
    return PANEL_STATUS.ACTIVE;
  }

  // Otherwise this is just a shell panel → hide the badge.
  return PANEL_STATUS.UNKNOWN;
}

/**
 * Human-readable label for the status.
 */
export function getPanelStatusLabel(status) {
  switch (status) {
    case PANEL_STATUS.RUNNING:
      return 'Running';
    case PANEL_STATUS.ACTIVE:
      return 'Activo';
    case PANEL_STATUS.WAITING:
      return 'Esperando';
    case PANEL_STATUS.BLOCKED:
      return 'Bloqueado';
    case PANEL_STATUS.IDLE:
      return 'Inactivo';
    case PANEL_STATUS.ERROR:
      return 'Error';
    case PANEL_STATUS.COMPLETED:
      return 'Completado';
    case PANEL_STATUS.UNKNOWN:
    default:
      return 'Desconocido';
  }
}

/**
 * Visual tokens (Tailwind classes) for each status.
 */
export function getPanelStatusStyle(status) {
  switch (status) {
    case PANEL_STATUS.RUNNING:
      return {
        dot: 'bg-emerald-400',
        pulse: true,
        border: 'border-emerald-400/40',
        bg: 'bg-emerald-400/12',
        text: 'text-emerald-300',
      };
    case PANEL_STATUS.ACTIVE:
      return {
        dot: 'bg-blue-400',
        pulse: false,
        border: 'border-blue-400/40',
        bg: 'bg-blue-400/12',
        text: 'text-blue-300',
      };
    case PANEL_STATUS.WAITING:
      return {
        dot: 'bg-amber-400',
        pulse: true,
        border: 'border-amber-400/40',
        bg: 'bg-amber-400/12',
        text: 'text-amber-300',
      };
    case PANEL_STATUS.BLOCKED:
      return {
        dot: 'bg-rose-400',
        pulse: true,
        border: 'border-rose-400/40',
        bg: 'bg-rose-400/12',
        text: 'text-rose-300',
      };
    case PANEL_STATUS.IDLE:
      return {
        dot: 'bg-slate-400',
        pulse: false,
        border: 'border-slate-400/40',
        bg: 'bg-slate-400/12',
        text: 'text-slate-300',
      };
    case PANEL_STATUS.ERROR:
      return {
        dot: 'bg-rose-400',
        pulse: false,
        border: 'border-rose-400/40',
        bg: 'bg-rose-400/12',
        text: 'text-rose-300',
      };
    case PANEL_STATUS.COMPLETED:
      return {
        dot: 'bg-cyan-400',
        pulse: false,
        border: 'border-cyan-400/40',
        bg: 'bg-cyan-400/12',
        text: 'text-cyan-300',
      };
    case PANEL_STATUS.UNKNOWN:
    default:
      return {
        dot: 'bg-slate-400',
        pulse: false,
        border: 'border-slate-400/40',
        bg: 'bg-slate-400/12',
        text: 'text-slate-300',
      };
  }
}

/**
 * Whether the badge should be rendered at all.
 */
export function shouldShowPanelStatus(status, { alwaysShow = false, isAgentPanel = false } = {}) {
  if (alwaysShow) return true;
  if (status === PANEL_STATUS.UNKNOWN) return false;
  if (status === PANEL_STATUS.IDLE) return isAgentPanel;
  return true;
}
