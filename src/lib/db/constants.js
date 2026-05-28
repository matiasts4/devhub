const AGENT_WORKSPACE_TERMINAL_STATUSES = ['completed', 'failed'];
const AGENT_WORKSPACE_BASE_COMMIT = 'f814998dd05cb491caf8637bf570dbd74b539090';
const AGENT_WORKSPACE_ACTIVE_LOCK_STATUSES = [
  'planned',
  'provisioning',
  'ready',
  'active',
  'paused',
  'cleanup_pending',
  'orphaned',
];

const AGENT_RUN_OBSERVED_DIRTY_STATUSES = ['clean', 'dirty', 'dirty-excluded'];
const SUPERVISOR_STATES = [
  'idle',
  'dispatch_pending',
  'lease_active',
  'awaiting_evidence',
  'retry_pending',
  'blocked',
  'awaiting_approval',
  'recovering_orphan',
  'closed',
];
const SUPERVISOR_OUTCOMES = [
  'wait',
  'dispatch',
  'retry',
  'block',
  'recover_orphan',
  'request_approval',
  'close',
];
const SUPERVISOR_REASON_CLASSES = [
  'blocked',
  'approval_required',
  'approval_rejected',
  'stale_lease',
  'orphaned_workspace',
  'orphaned_run',
  'dirty_excluded_observed',
  'recoverable_failure',
  'blocked_dependency',
  'unchanged_failure',
  'completed',
];
const SUPERVISOR_APPROVAL_STATUSES = ['pending', 'approved', 'rejected'];
const TELEGRAM_INTENT_ACTIONS = [
  'status.query',
  'task.detail',
  'workspace.detail',
  'approval.respond',
  'notification.retry',
  'subscription.set',
];
const TELEGRAM_INTENT_STATUSES = ['accepted', 'pending_approval', 'denied', 'replayed'];
const TELEGRAM_DELIVERY_STATUSES = ['sent', 'failed', 'retry_pending'];
const TELEGRAM_SUBSCRIPTION_STATUSES = ['mute', 'unmute'];
const SWARM_MISSION_STATUSES = ['planned', 'active', 'paused', 'completed', 'failed', 'aborted'];
const SWARM_MISSION_KINDS = ['task_execution', 'sdd_phase', 'review', 'recovery', 'coordination'];
const MISSION_PARTICIPANT_ROLES = ['director', 'executor', 'reviewer', 'observer'];
const MISSION_PARTICIPANT_STATUSES = ['invited', 'active', 'paused', 'completed', 'removed'];
const MISSION_MESSAGE_KINDS = [
  'directive',
  'status',
  'handoff',
  'decision',
  'risk',
  'approval_request',
  'approval_result',
];
const MISSION_DELIVERY_STATUSES = ['pending', 'sent', 'failed', 'retry_pending', 'expired'];
const AGENT_PRESENCE_STATES = ['online', 'busy', 'idle', 'waiting', 'offline'];
const AGENT_PRESENCE_TTL_MS = 120_000;
const MISSION_IDENTITY_METADATA_FIELDS = [
  'profile_key',
  'runtime_role',
  'workflow_phase',
  'provider',
  'runtime_package',
];
const RUNTIME_ONLY_FIELDS = [
  'terminal_log',
  'terminal_logs',
  'log',
  'logs',
  'transcript',
  'transcripts',
  'session_id',
  'session_state',
  'sse_event',
  'sse_payload',
  'stdout',
  'stderr',
  'tool_output',
  'raw_output',
];
const DIRECTOR_SNAPSHOT_MISSION_FIELDS = [
  'mission_id',
  'project_id',
  'task_id',
  'workspace_id',
  'run_id',
  'approval_checkpoint_key',
  'owner_agent_id',
  'kind',
  'status',
  'title',
  'summary',
  'evidence_ref',
  'started_at',
  'updated_at',
  'completed_at',
  'created_at',
];
const DIRECTOR_SNAPSHOT_PARTICIPANT_FIELDS = [
  'participant_id',
  'mission_id',
  'agent_id',
  'role_in_mission',
  'status',
  'joined_at',
  'left_at',
  'created_at',
  'updated_at',
];
const DIRECTOR_SNAPSHOT_MESSAGE_FIELDS = [
  'message_id',
  'mission_id',
  'sender_agent_id',
  'message_kind',
  'body_summary',
  'evidence_ref',
  'related_task_id',
  'related_workspace_id',
  'related_run_id',
  'related_artifact_id',
  'related_approval_checkpoint_key',
  'created_at',
  'updated_at',
];
const DIRECTOR_SNAPSHOT_DELIVERY_FIELDS = [
  'delivery_id',
  'message_id',
  'recipient_agent_id',
  'channel',
  'status',
  'delivery_ref',
  'evidence_ref',
  'last_error',
  'attempt_count',
  'last_attempt_at',
  'acked_at',
  'created_at',
  'updated_at',
];
const DIRECTOR_SNAPSHOT_PRESENCE_FIELDS = [
  'presence_id',
  'mission_id',
  'agent_id',
  'workspace_id',
  'run_id',
  'runtime_surface',
  'presence_state',
  'status_summary',
  'evidence_ref',
  'last_seen_at',
  'expires_at',
  'created_at',
  'updated_at',
];

module.exports = {
  AGENT_WORKSPACE_TERMINAL_STATUSES,
  AGENT_WORKSPACE_BASE_COMMIT,
  AGENT_WORKSPACE_ACTIVE_LOCK_STATUSES,
  AGENT_RUN_OBSERVED_DIRTY_STATUSES,
  SUPERVISOR_STATES,
  SUPERVISOR_OUTCOMES,
  SUPERVISOR_REASON_CLASSES,
  SUPERVISOR_APPROVAL_STATUSES,
  TELEGRAM_INTENT_ACTIONS,
  TELEGRAM_INTENT_STATUSES,
  TELEGRAM_DELIVERY_STATUSES,
  TELEGRAM_SUBSCRIPTION_STATUSES,
  SWARM_MISSION_STATUSES,
  SWARM_MISSION_KINDS,
  MISSION_PARTICIPANT_ROLES,
  MISSION_PARTICIPANT_STATUSES,
  MISSION_MESSAGE_KINDS,
  MISSION_DELIVERY_STATUSES,
  AGENT_PRESENCE_STATES,
  AGENT_PRESENCE_TTL_MS,
  MISSION_IDENTITY_METADATA_FIELDS,
  RUNTIME_ONLY_FIELDS,
  DIRECTOR_SNAPSHOT_MISSION_FIELDS,
  DIRECTOR_SNAPSHOT_PARTICIPANT_FIELDS,
  DIRECTOR_SNAPSHOT_MESSAGE_FIELDS,
  DIRECTOR_SNAPSHOT_DELIVERY_FIELDS,
  DIRECTOR_SNAPSHOT_PRESENCE_FIELDS,
};
