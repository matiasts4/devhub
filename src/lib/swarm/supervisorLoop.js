/* global module */

const TERMINAL_RUN_STATUSES = new Set(['succeeded', 'failed', 'aborted', 'superseded']);
const ACTIVE_WORKSPACE_STATUSES = new Set(['ready', 'active', 'paused']);
const RECOVERABLE_FAILURE_REASON = 'recoverable_failure';
const MAX_RETRY_COUNT = 3;

function pickEvidenceRef(...values) {
  for (const value of values) {
    if (value) return value;
  }
  return null;
}

function countAttempts(runs = []) {
  return runs.length;
}

function countTrailingUnchangedFailures(runFacts = []) {
  if (!runFacts.length) return 0;
  const [latest, previous] = runFacts;
  if (!latest || !previous) return 0;
  if (latest.status !== 'failed' || previous.status !== 'failed') return 0;
  if (latest.terminal_reason_class !== RECOVERABLE_FAILURE_REASON) return 0;
  if (previous.terminal_reason_class !== RECOVERABLE_FAILURE_REASON) return 0;
  if (!latest.evidence_ref || !previous.evidence_ref) return 0;
  return latest.evidence_ref === previous.evidence_ref ? 1 : 0;
}

function nextCounter(existingValue = 0, shouldIncrement = false) {
  return shouldIncrement ? Number(existingValue || 0) + 1 : Number(existingValue || 0);
}

function sameCheckpoint(existingSnapshot, approvalCheckpoint) {
  return Boolean(
    existingSnapshot?.approval_checkpoint_key &&
    approvalCheckpoint?.checkpoint_key &&
    existingSnapshot.approval_checkpoint_key === approvalCheckpoint.checkpoint_key
  );
}

function buildSnapshot(base = {}, overrides = {}) {
  return {
    task_id: base.task_id || base.id,
    supervisor_state: overrides.supervisor_state,
    outcome: overrides.outcome,
    reason_class: overrides.reason_class ?? null,
    task_retry_count: Number(overrides.task_retry_count ?? 0),
    attempt_count: Number(overrides.attempt_count ?? 0),
    unchanged_failure_count: Number(overrides.unchanged_failure_count ?? 0),
    approval_request_count: Number(overrides.approval_request_count ?? 0),
    orphan_recovery_count: Number(overrides.orphan_recovery_count ?? 0),
    workspace_id: overrides.workspace_id ?? null,
    run_id: overrides.run_id ?? null,
    evidence_ref: overrides.evidence_ref ?? null,
    approval_checkpoint_key: overrides.approval_checkpoint_key ?? null,
  };
}

function evaluateSupervisorSnapshot({
  task,
  workspace = null,
  latestRun = null,
  latestArtifact = null,
  runFacts = [],
  existingSnapshot = null,
  approvalCheckpoint = null,
  staleLeaseObserved = false,
}) {
  const taskRetryCount = Number(task?.retry_count || 0);
  const attemptCount = countAttempts(runFacts);
  const latestEvidenceRef = pickEvidenceRef(
    latestArtifact?.evidence_ref,
    workspace?.evidence_ref,
    existingSnapshot?.evidence_ref
  );
  const unchangedFailureCount = countTrailingUnchangedFailures(runFacts);
  const staleLeaseStillRecovering = Boolean(
    existingSnapshot?.reason_class === 'stale_lease' &&
    workspace &&
    ACTIVE_WORKSPACE_STATUSES.has(workspace.status) &&
    latestRun &&
    !TERMINAL_RUN_STATUSES.has(latestRun.status)
  );
  const pendingApprovalAlreadyRequested = Boolean(
    approvalCheckpoint?.status === 'pending' && sameCheckpoint(existingSnapshot, approvalCheckpoint)
  );
  const approvalCheckpointKey =
    approvalCheckpoint?.status === 'approved'
      ? null
      : approvalCheckpoint?.checkpoint_key || existingSnapshot?.approval_checkpoint_key || null;

  if (approvalCheckpoint?.status === 'pending') {
    return buildSnapshot(task, {
      supervisor_state: 'awaiting_approval',
      outcome: pendingApprovalAlreadyRequested ? 'wait' : 'request_approval',
      reason_class: approvalCheckpoint.reason_class,
      task_retry_count: taskRetryCount,
      attempt_count: attemptCount,
      unchanged_failure_count: unchangedFailureCount,
      approval_request_count: pendingApprovalAlreadyRequested
        ? Number(existingSnapshot?.approval_request_count || 1)
        : nextCounter(existingSnapshot?.approval_request_count, true),
      orphan_recovery_count: Number(existingSnapshot?.orphan_recovery_count || 0),
      workspace_id:
        approvalCheckpoint.workspace_id || workspace?.id || existingSnapshot?.workspace_id,
      run_id: approvalCheckpoint.run_id || latestRun?.run_id || existingSnapshot?.run_id,
      evidence_ref: pickEvidenceRef(approvalCheckpoint.evidence_ref, latestEvidenceRef),
      approval_checkpoint_key: approvalCheckpoint.checkpoint_key,
    });
  }

  if (approvalCheckpoint?.status === 'rejected') {
    return buildSnapshot(task, {
      supervisor_state: 'blocked',
      outcome: 'block',
      reason_class: 'approval_rejected',
      task_retry_count: taskRetryCount,
      attempt_count: attemptCount,
      unchanged_failure_count: unchangedFailureCount,
      approval_request_count: Number(existingSnapshot?.approval_request_count || 1),
      orphan_recovery_count: Number(existingSnapshot?.orphan_recovery_count || 0),
      workspace_id:
        approvalCheckpoint.workspace_id || workspace?.id || existingSnapshot?.workspace_id,
      run_id: approvalCheckpoint.run_id || latestRun?.run_id || existingSnapshot?.run_id,
      evidence_ref: pickEvidenceRef(approvalCheckpoint.evidence_ref, latestEvidenceRef),
      approval_checkpoint_key: approvalCheckpoint.checkpoint_key,
    });
  }

  if (workspace?.status === 'orphaned') {
    const sameReason = existingSnapshot?.reason_class === 'orphaned_workspace';
    return buildSnapshot(task, {
      supervisor_state: 'recovering_orphan',
      outcome: 'recover_orphan',
      reason_class: 'orphaned_workspace',
      task_retry_count: taskRetryCount,
      attempt_count: attemptCount,
      unchanged_failure_count: unchangedFailureCount,
      approval_request_count: Number(existingSnapshot?.approval_request_count || 0),
      orphan_recovery_count: sameReason
        ? Number(existingSnapshot?.orphan_recovery_count || 1)
        : nextCounter(existingSnapshot?.orphan_recovery_count, true),
      workspace_id: workspace.id,
      run_id: latestRun?.run_id || existingSnapshot?.run_id,
      evidence_ref: latestEvidenceRef,
      approval_checkpoint_key: approvalCheckpointKey,
    });
  }

  if (staleLeaseObserved || staleLeaseStillRecovering) {
    const sameReason = existingSnapshot?.reason_class === 'stale_lease';
    return buildSnapshot(task, {
      supervisor_state: 'recovering_orphan',
      outcome: 'recover_orphan',
      reason_class: 'stale_lease',
      task_retry_count: taskRetryCount,
      attempt_count: attemptCount,
      unchanged_failure_count: unchangedFailureCount,
      approval_request_count: Number(existingSnapshot?.approval_request_count || 0),
      orphan_recovery_count: sameReason
        ? Number(existingSnapshot?.orphan_recovery_count || 1)
        : nextCounter(existingSnapshot?.orphan_recovery_count, true),
      workspace_id: workspace?.id || existingSnapshot?.workspace_id,
      run_id: latestRun?.run_id || existingSnapshot?.run_id,
      evidence_ref: latestEvidenceRef,
      approval_checkpoint_key: approvalCheckpointKey,
    });
  }

  if (workspace && workspace.status === 'active' && workspace.run_id_or_session_id && !latestRun) {
    const sameReason = existingSnapshot?.reason_class === 'orphaned_run';
    return buildSnapshot(task, {
      supervisor_state: 'recovering_orphan',
      outcome: 'recover_orphan',
      reason_class: 'orphaned_run',
      task_retry_count: taskRetryCount,
      attempt_count: attemptCount,
      unchanged_failure_count: unchangedFailureCount,
      approval_request_count: Number(existingSnapshot?.approval_request_count || 0),
      orphan_recovery_count: sameReason
        ? Number(existingSnapshot?.orphan_recovery_count || 1)
        : nextCounter(existingSnapshot?.orphan_recovery_count, true),
      workspace_id: workspace.id,
      run_id: existingSnapshot?.run_id || null,
      evidence_ref: latestEvidenceRef,
      approval_checkpoint_key: approvalCheckpointKey,
    });
  }

  if (workspace?.observed_dirty === 'dirty-excluded') {
    return buildSnapshot(task, {
      supervisor_state: 'awaiting_evidence',
      outcome: 'wait',
      reason_class: 'dirty_excluded_observed',
      task_retry_count: taskRetryCount,
      attempt_count: attemptCount,
      unchanged_failure_count: unchangedFailureCount,
      approval_request_count: Number(existingSnapshot?.approval_request_count || 0),
      orphan_recovery_count: Number(existingSnapshot?.orphan_recovery_count || 0),
      workspace_id: workspace.id,
      run_id: latestRun?.run_id || existingSnapshot?.run_id,
      evidence_ref: latestEvidenceRef,
      approval_checkpoint_key: approvalCheckpointKey,
    });
  }

  if (
    latestRun?.status === 'failed' &&
    latestRun?.terminal_reason_class === RECOVERABLE_FAILURE_REASON
  ) {
    if (unchangedFailureCount > 0) {
      return buildSnapshot(task, {
        supervisor_state: 'blocked',
        outcome: 'block',
        reason_class: 'unchanged_failure',
        task_retry_count: taskRetryCount,
        attempt_count: attemptCount,
        unchanged_failure_count: unchangedFailureCount,
        approval_request_count: Number(existingSnapshot?.approval_request_count || 0),
        orphan_recovery_count: Number(existingSnapshot?.orphan_recovery_count || 0),
        workspace_id: workspace?.id || latestRun.workspace_id || existingSnapshot?.workspace_id,
        run_id: latestRun.run_id,
        evidence_ref: latestEvidenceRef,
        approval_checkpoint_key: approvalCheckpointKey,
      });
    }

    if (taskRetryCount >= MAX_RETRY_COUNT) {
      return buildSnapshot(task, {
        supervisor_state: 'blocked',
        outcome: 'block',
        reason_class: 'blocked',
        task_retry_count: taskRetryCount,
        attempt_count: attemptCount,
        unchanged_failure_count: unchangedFailureCount,
        approval_request_count: Number(existingSnapshot?.approval_request_count || 0),
        orphan_recovery_count: Number(existingSnapshot?.orphan_recovery_count || 0),
        workspace_id: workspace?.id || latestRun.workspace_id || existingSnapshot?.workspace_id,
        run_id: latestRun.run_id,
        evidence_ref: latestEvidenceRef,
        approval_checkpoint_key: approvalCheckpointKey,
      });
    }

    return buildSnapshot(task, {
      supervisor_state: 'retry_pending',
      outcome: 'retry',
      reason_class: 'recoverable_failure',
      task_retry_count: taskRetryCount,
      attempt_count: attemptCount,
      unchanged_failure_count: unchangedFailureCount,
      approval_request_count: Number(existingSnapshot?.approval_request_count || 0),
      orphan_recovery_count: Number(existingSnapshot?.orphan_recovery_count || 0),
      workspace_id: workspace?.id || latestRun.workspace_id || existingSnapshot?.workspace_id,
      run_id: latestRun.run_id,
      evidence_ref: latestEvidenceRef,
      approval_checkpoint_key: approvalCheckpointKey,
    });
  }

  if (task?.status === 'in_progress') {
    return buildSnapshot(task, {
      supervisor_state: 'lease_active',
      outcome: 'wait',
      reason_class: null,
      task_retry_count: taskRetryCount,
      attempt_count: attemptCount,
      unchanged_failure_count: unchangedFailureCount,
      approval_request_count: Number(existingSnapshot?.approval_request_count || 0),
      orphan_recovery_count: Number(existingSnapshot?.orphan_recovery_count || 0),
      workspace_id: workspace?.id || existingSnapshot?.workspace_id,
      run_id: latestRun?.run_id || existingSnapshot?.run_id,
      evidence_ref: latestEvidenceRef,
      approval_checkpoint_key: approvalCheckpointKey,
    });
  }

  if (workspace && (workspace.status === 'planned' || workspace.status === 'provisioning')) {
    return buildSnapshot(task, {
      supervisor_state: 'idle',
      outcome: 'wait',
      reason_class: null,
      task_retry_count: taskRetryCount,
      attempt_count: attemptCount,
      unchanged_failure_count: unchangedFailureCount,
      approval_request_count: Number(existingSnapshot?.approval_request_count || 0),
      orphan_recovery_count: Number(existingSnapshot?.orphan_recovery_count || 0),
      workspace_id: workspace.id,
      run_id: latestRun?.run_id || existingSnapshot?.run_id,
      evidence_ref: latestEvidenceRef,
      approval_checkpoint_key: approvalCheckpointKey,
    });
  }

  if (workspace && ACTIVE_WORKSPACE_STATUSES.has(workspace.status) && task?.status === 'pending') {
    return buildSnapshot(task, {
      supervisor_state: 'dispatch_pending',
      outcome: 'dispatch',
      reason_class: null,
      task_retry_count: taskRetryCount,
      attempt_count: attemptCount,
      unchanged_failure_count: unchangedFailureCount,
      approval_request_count: Number(existingSnapshot?.approval_request_count || 0),
      orphan_recovery_count: Number(existingSnapshot?.orphan_recovery_count || 0),
      workspace_id: workspace.id,
      run_id: latestRun?.run_id || existingSnapshot?.run_id,
      evidence_ref: latestEvidenceRef,
      approval_checkpoint_key: approvalCheckpointKey,
    });
  }

  return buildSnapshot(task, {
    supervisor_state: 'idle',
    outcome: 'wait',
    reason_class: null,
    task_retry_count: taskRetryCount,
    attempt_count: attemptCount,
    unchanged_failure_count: unchangedFailureCount,
    approval_request_count: Number(existingSnapshot?.approval_request_count || 0),
    orphan_recovery_count: Number(existingSnapshot?.orphan_recovery_count || 0),
    workspace_id: workspace?.id || existingSnapshot?.workspace_id,
    run_id: latestRun?.run_id || existingSnapshot?.run_id,
    evidence_ref: latestEvidenceRef,
    approval_checkpoint_key: approvalCheckpointKey,
  });
}

module.exports = {
  MAX_RETRY_COUNT,
  countAttempts,
  countTrailingUnchangedFailures,
  evaluateSupervisorSnapshot,
};
