/**
 * Panel status helpers — map agent/connection states to a small visual vocabulary
 * shown in each terminal panel header.
 *
 * Vocabulary:
 *   running   → green pulsing dot  (the agent is actually doing work)
 *   active    → blue/accent dot    (agent/session connected and alive)
 *   waiting   → amber/yellow dot   (connecting, suspended, or blocked)
 *   idle      → gray dot           (connected but no agent activity)
 *   error     → red dot            (error, aborted, terminated, disconnected)
 *   completed → slate/blue dot     (finished successfully)
 *   unknown   → gray dot           (we don't know yet)
 */

export const PANEL_STATUS = {
  RUNNING: 'running',
  ACTIVE: 'active',
  WAITING: 'waiting',
  IDLE: 'idle',
  ERROR: 'error',
  COMPLETED: 'completed',
  UNKNOWN: 'unknown',
};

const IN_PROGRESS_STATUSES = new Set(['running', 'working', 'thinking', 'busy']);

const AGENT_TUI_PATTERN = /\b(opencode|kimi|hermes|grok|groc|codex)\b/i;

const ERROR_STATUSES = new Set(['error', 'aborted', 'failed']);
const COMPLETED_STATUSES = new Set(['completed', 'succeeded', 'done']);
const WAITING_STATUSES = new Set(['waiting', 'pending', 'paused']);

const DEFAULT_ACTIVITY_THRESHOLD_MS = 3000;

/**
 * Normalize an arbitrary backend status string into one of the panel statuses.
 */
export function normalizePanelStatus(status) {
  const raw = String(status || '')
    .trim()
    .toLowerCase();
  if (!raw) return PANEL_STATUS.UNKNOWN;
  if (IN_PROGRESS_STATUSES.has(raw)) return PANEL_STATUS.RUNNING;
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
 * Determine whether a PTY session has recent activity.
 *
 * @param {object} options
 * @param {string|null} options.lastActivityAt - ISO timestamp of last PTY input/output
 * @param {number} [options.thresholdMs=3000] - activity freshness window
 */
export function isTerminalRecentlyActive(activity, thresholdMs = DEFAULT_ACTIVITY_THRESHOLD_MS) {
  const lastActivityAt = activity && typeof activity === 'object' ? activity.lastActivityAt : null;
  if (!lastActivityAt) return false;
  const last = new Date(lastActivityAt).getTime();
  if (Number.isNaN(last)) return false;
  const effectiveThreshold =
    activity && typeof activity === 'object' && activity.thresholdMs != null
      ? activity.thresholdMs
      : thresholdMs;
  return (
    Date.now() - last <= Math.max(500, Number(effectiveThreshold) || DEFAULT_ACTIVITY_THRESHOLD_MS)
  );
}

/**
 * Derive a panel status from connection state and optional agent run metadata.
 *
 * @param {object} options
 * @param {string|null} options.connectionState - panel connection state from TerminalTTY
 * @param {object|null} options.agentRun - agent run metadata from devhub_agent_runs
 * @param {string|null} options.initialCommand - the panel's initial command
 * @param {string|null} options.apiStatus - latest status fetched from /api/agenthub/sessions/{id}/status
 * @param {object|null} options.terminalActivity - PTY activity metadata { lastActivityAt, lastActivityAgoMs, isActive }
 */
export function derivePanelStatus({
  connectionState,
  agentRun,
  initialCommand,
  apiStatus,
  terminalActivity = null,
}) {
  // If we have a fresh API status, it wins.
  if (apiStatus) {
    return normalizePanelStatus(apiStatus);
  }

  const isAgentPanel = Boolean(agentRun || AGENT_TUI_PATTERN.test(String(initialCommand || '')));
  const hasRecentPtyActivity =
    terminalActivity?.isActive || isTerminalRecentlyActive(terminalActivity);

  // Recent PTY activity means the agent is actually doing work right now.
  if (hasRecentPtyActivity && isAgentPanel) {
    return PANEL_STATUS.RUNNING;
  }

  // Connection-level states take precedence when there is no API status yet.
  if (connectionState) {
    const normalized = normalizePanelStatus(connectionState);
    if (normalized !== PANEL_STATUS.UNKNOWN) {
      return normalized;
    }
  }

  // Terminal-level failure states.
  const terminalStatuses = new Set(['terminated', 'agent-exited', 'error']);
  if (terminalStatuses.has(connectionState)) {
    return PANEL_STATUS.ERROR;
  }

  // We have an agent run → active until API/PTY confirms a more specific state.
  if (agentRun) {
    return PANEL_STATUS.ACTIVE;
  }

  // No agent run, but the panel was launched with an agent TUI command → active.
  if (AGENT_TUI_PATTERN.test(String(initialCommand || ''))) {
    return PANEL_STATUS.ACTIVE;
  }

  // Otherwise the panel is just a shell → hide the badge.
  return PANEL_STATUS.IDLE;
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
export function shouldShowPanelStatus(status, { alwaysShow = false } = {}) {
  if (alwaysShow) return true;
  return status !== PANEL_STATUS.IDLE && status !== PANEL_STATUS.UNKNOWN;
}
