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
  const snapshot = status?.snapshot || null;
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
    if (snapshot?.degraded) {
      return {
        workspaceStatus: null,
        runStatus: null,
        terminalReasonClass: null,
        artifactKind: null,
        artifactCount: 0,
        evidenceRef: null,
        label: 'DEGRADED-UNAVAILABLE',
        degraded: true,
      };
    }
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
    degraded: Boolean(snapshot?.degraded),
  };
}

function getCurrentToolDisplay(status) {
  const currentTool = status?.current_tool || null;
  if (!currentTool || GIT_VERB_PATTERN.test(currentTool)) {
    return null;
  }
  return currentTool;
}

function buildTelegramTargetSummary(item) {
  const parts = [];
  if (item?.task_id) parts.push(`task:${item.task_id}`);
  if (item?.workspace_id) parts.push(`ws:${item.workspace_id}`);
  if (item?.run_id) parts.push(`run:${item.run_id}`);
  return parts.join(' · ');
}

function normalizeTelegramActivityItem(item) {
  const entryType = item?.entry_type || 'activity';
  const targetSummary = buildTelegramTargetSummary(item);
  const primaryStatus =
    item?.delivery_status || item?.approval_status || item?.intent_status || null;
  const detailParts = [];

  if (item?.audit_status) detailParts.push(`audit:${item.audit_status}`);
  if (item?.evidence_ref) detailParts.push(item.evidence_ref);
  if (item?.delivery_last_error) detailParts.push(`error:${item.delivery_last_error}`);

  return {
    ...item,
    entryType,
    title: item?.action || entryType,
    primaryStatus,
    approvalStatus: item?.approval_status || null,
    deliveryStatus: item?.delivery_status || null,
    targetSummary,
    detail: detailParts.join(' · '),
  };
}

function getTelegramSnapshotBadges(status) {
  const badges = [];
  const approvalStatus = status?.snapshot?.approval?.status || null;
  const deliveryStatus = status?.snapshot?.delivery?.last_status || null;
  const deliveryAttempts = Number(status?.snapshot?.delivery?.attempts_count || 0) || 0;

  if (approvalStatus) {
    badges.push({
      key: 'approval',
      label: `approval: ${approvalStatus}`,
      tone:
        approvalStatus === 'approved'
          ? 'success'
          : approvalStatus === 'rejected'
            ? 'danger'
            : 'warn',
    });
  }

  if (deliveryStatus) {
    badges.push({
      key: 'delivery',
      label: `delivery: ${deliveryStatus}${deliveryAttempts ? ` · ${deliveryAttempts}` : ''}`,
      tone: deliveryStatus === 'sent' ? 'success' : deliveryStatus === 'failed' ? 'danger' : 'warn',
    });
  }

  return badges;
}

module.exports = {
  TELEGRAM_BUSY_POLLING_MS,
  TELEGRAM_IDLE_POLLING_MS,
  getTelegramPollingInterval,
  getTelegramSnapshotBadges,
  normalizeTelegramActivityItem,
  getWorkspaceOutcomeDisplay,
  shouldShowRealtimeBadge,
  getCurrentToolDisplay,
};
