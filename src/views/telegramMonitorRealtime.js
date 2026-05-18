/* global module */

const TELEGRAM_BUSY_POLLING_MS = 3_000;
const TELEGRAM_IDLE_POLLING_MS = 30_000;
const GIT_VERB_PATTERN = /\b(git|checkout|merge|worktree|branch)\b/i;

function getTelegramPollingInterval(status) {
  return status?.is_busy ? TELEGRAM_BUSY_POLLING_MS : TELEGRAM_IDLE_POLLING_MS;
}

function shouldShowRealtimeBadge(status) {
  return Boolean(status?.is_busy);
}

function getWorkspaceOutcomeDisplay(status) {
  const workspaceStatus =
    status?.workspace_status || status?.workspaceStatus || status?.run_status || null;
  const evidenceRef = status?.evidence_ref || status?.evidenceRef || null;

  if (!workspaceStatus && !evidenceRef) {
    return null;
  }

  return {
    workspaceStatus,
    evidenceRef,
    label: workspaceStatus ? String(workspaceStatus).toUpperCase() : 'UNKNOWN',
  };
}

function getCurrentToolDisplay(status) {
  const currentTool = status?.current_tool || null;
  if (!currentTool || GIT_VERB_PATTERN.test(currentTool)) {
    return null;
  }
  return currentTool;
}

module.exports = {
  TELEGRAM_BUSY_POLLING_MS,
  TELEGRAM_IDLE_POLLING_MS,
  getTelegramPollingInterval,
  getWorkspaceOutcomeDisplay,
  shouldShowRealtimeBadge,
  getCurrentToolDisplay,
};
