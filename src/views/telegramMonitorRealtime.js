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
  const workspaceStatus = status?.workspace_status || status?.workspaceStatus || null;
  const runStatus = status?.run_status || status?.runStatus || null;
  const terminalReasonClass = status?.terminal_reason_class || status?.terminalReasonClass || null;
  const artifactKind = status?.latest_artifact_kind || status?.latestArtifactKind || null;
  const artifactCount = Number(status?.artifact_count || status?.artifactCount || 0) || 0;
  const evidenceRef =
    status?.latest_artifact_evidence_ref ||
    status?.latestArtifactEvidenceRef ||
    status?.evidence_ref ||
    status?.evidenceRef ||
    null;

  if (!workspaceStatus && !runStatus && !evidenceRef) {
    return null;
  }

  return {
    workspaceStatus,
    runStatus,
    terminalReasonClass,
    artifactKind,
    artifactCount,
    evidenceRef,
    label: String(runStatus || workspaceStatus || 'unknown').toUpperCase(),
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
