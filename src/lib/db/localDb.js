/**
 * DevHub Local Database Layer — better-sqlite3 for local-first architecture.
 */

const Database = require('better-sqlite3');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { resolveDbPath } = require('./pathResolver');
const {
  isAgentRunStatus,
  isTerminalAgentRunStatus,
  normalizeEvidenceRef,
  parseEvidenceRef,
  validateAgentArtifactInput,
} = require('./agentRunArtifacts');

const DB_PATH = resolveDbPath();
let _db = null;

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

function ensureRuntimeSchema(db) {
  if (typeof db.pragma === 'function') {
    db.pragma('foreign_keys = ON');
  }

  db.exec(`
    CREATE TABLE IF NOT EXISTS projects (
      id TEXT PRIMARY KEY,
      user_id TEXT,
      name TEXT NOT NULL,
      description TEXT,
      color TEXT DEFAULT '#58A6FF',
      status TEXT DEFAULT 'active',
      progress INTEGER DEFAULT 0,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now')),
      planning_prompt TEXT,
      planning_status TEXT DEFAULT 'none',
      project_type TEXT DEFAULT 'software',
      documentation_policy TEXT DEFAULT 'personal',
      local_path TEXT
    );

    CREATE TABLE IF NOT EXISTS project_files (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL,
      user_id TEXT,
      file_name TEXT NOT NULL,
      content TEXT,
      file_type TEXT,
      size_chars INTEGER DEFAULT 0,
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE INDEX IF NOT EXISTS idx_project_files_project ON project_files(project_id);

    CREATE TABLE IF NOT EXISTS telegram_activity (
      id TEXT PRIMARY KEY,
      chat_id TEXT,
      event_type TEXT NOT NULL,
      direction TEXT,
      source TEXT DEFAULT 'telegram',
      command TEXT,
      content_preview TEXT,
      status TEXT DEFAULT 'ok',
      metadata TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_telegram_activity_created ON telegram_activity(created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_telegram_activity_chat ON telegram_activity(chat_id);

    CREATE TABLE IF NOT EXISTS telegram_sessions (
      id TEXT PRIMARY KEY,
      chat_id TEXT NOT NULL UNIQUE,
      user_name TEXT,
      agent TEXT,
      message_count INTEGER DEFAULT 0,
      last_activity TEXT,
      status TEXT DEFAULT 'active',
      created_at TEXT DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_telegram_sessions_chat ON telegram_sessions(chat_id);
    
    CREATE TABLE IF NOT EXISTS agent_hub_sessions (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL,
      title TEXT NOT NULL,
      agent_model TEXT,
      parent_id TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (parent_id) REFERENCES agent_hub_sessions(id) ON DELETE SET NULL
    );
    CREATE INDEX IF NOT EXISTS idx_agent_hub_sessions_project ON agent_hub_sessions(project_id);

    CREATE TABLE IF NOT EXISTS agent_hub_messages (
      id TEXT PRIMARY KEY,
      session_id TEXT NOT NULL,
      role TEXT NOT NULL,
      content TEXT NOT NULL,
      meta TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_agent_hub_messages_session ON agent_hub_messages(session_id);

    -- Agent Traces (observability)
    CREATE TABLE IF NOT EXISTS agent_traces (
      id TEXT PRIMARY KEY,
      session_id TEXT NOT NULL,
      trace_type TEXT NOT NULL,
      agent_name TEXT,
      tool_name TEXT,
      tool_input TEXT,
      tool_output TEXT,
      tool_status TEXT,
      content TEXT,
      duration_ms INTEGER,
      time_start REAL,
      time_end REAL,
      metadata TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (session_id) REFERENCES agent_hub_sessions(id) ON DELETE CASCADE
    );
    CREATE INDEX IF NOT EXISTS idx_traces_session ON agent_traces(session_id);
    CREATE INDEX IF NOT EXISTS idx_traces_type ON agent_traces(trace_type);
    CREATE INDEX IF NOT EXISTS idx_traces_tool ON agent_traces(tool_name);
    CREATE INDEX IF NOT EXISTS idx_traces_status ON agent_traces(tool_status);
    CREATE INDEX IF NOT EXISTS idx_traces_created ON agent_traces(created_at);

    -- FTS5 for trace search
    CREATE VIRTUAL TABLE IF NOT EXISTS agent_traces_fts USING fts5(
      tool_name, tool_input, tool_output, content,
      content='agent_traces',
      content_rowid='rowid'
    );
    CREATE TRIGGER IF NOT EXISTS traces_fts_insert AFTER INSERT ON agent_traces BEGIN
      INSERT INTO agent_traces_fts(rowid, tool_name, tool_input, tool_output, content)
      VALUES (new.rowid, new.tool_name, new.tool_input, new.tool_output, new.content);
    END;
    CREATE TRIGGER IF NOT EXISTS traces_fts_delete AFTER DELETE ON agent_traces BEGIN
      INSERT INTO agent_traces_fts(agent_traces_fts, rowid, tool_name, tool_input, tool_output, content)
      VALUES ('delete', old.rowid, old.tool_name, old.tool_input, old.tool_output, old.content);
    END;
    CREATE TRIGGER IF NOT EXISTS traces_fts_update AFTER UPDATE ON agent_traces BEGIN
      INSERT INTO agent_traces_fts(agent_traces_fts, rowid, tool_name, tool_input, tool_output, content)
      VALUES ('delete', old.rowid, old.tool_name, old.tool_input, old.tool_output, old.content);
      INSERT INTO agent_traces_fts(rowid, tool_name, tool_input, tool_output, content)
      VALUES (new.rowid, new.tool_name, new.tool_input, new.tool_output, new.content);
    END;

    -- Session Usage tracking
    CREATE TABLE IF NOT EXISTS agent_session_usage (
      id TEXT PRIMARY KEY,
      session_id TEXT NOT NULL,
      prompt_tokens INTEGER DEFAULT 0,
      completion_tokens INTEGER DEFAULT 0,
      total_tokens INTEGER DEFAULT 0,
      context_window_size INTEGER,
      context_utilization REAL,
      tool_calls_count INTEGER DEFAULT 0,
      total_duration_ms INTEGER DEFAULT 0,
      updated_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (session_id) REFERENCES agent_hub_sessions(id) ON DELETE CASCADE
    );
    CREATE UNIQUE INDEX IF NOT EXISTS idx_usage_session_unique ON agent_session_usage(session_id);

    -- Telegram session mapping
    CREATE TABLE IF NOT EXISTS telegram_session_map (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      telegram_chat_id TEXT NOT NULL UNIQUE,
      session_id TEXT NOT NULL,
      project_id TEXT,
      active INTEGER DEFAULT 1,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (session_id) REFERENCES agent_hub_sessions(id) ON DELETE CASCADE
    );
    CREATE INDEX IF NOT EXISTS idx_tg_map_chat ON telegram_session_map(telegram_chat_id);
    CREATE INDEX IF NOT EXISTS idx_tg_map_session ON telegram_session_map(session_id);

    CREATE TABLE IF NOT EXISTS telegram_actor_mappings (
      actor_id TEXT PRIMARY KEY,
      telegram_user_id TEXT NOT NULL UNIQUE,
      telegram_chat_id TEXT,
      devhub_actor_id TEXT NOT NULL,
      display_name TEXT,
      allowlisted INTEGER NOT NULL DEFAULT 0,
      metadata TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_tg_actor_chat ON telegram_actor_mappings(telegram_chat_id);
    CREATE INDEX IF NOT EXISTS idx_tg_actor_devhub ON telegram_actor_mappings(devhub_actor_id);

    CREATE TABLE IF NOT EXISTS telegram_intent_envelopes (
      intent_id TEXT PRIMARY KEY,
      idempotency_key TEXT NOT NULL UNIQUE,
      actor_id TEXT NOT NULL,
      telegram_chat_id TEXT NOT NULL,
      message_id TEXT,
      update_id TEXT,
      action TEXT NOT NULL CHECK(action IN (
        'status.query',
        'task.detail',
        'workspace.detail',
        'approval.respond',
        'notification.retry',
        'subscription.set'
      )),
      task_id TEXT,
      workspace_id TEXT,
      run_id TEXT,
      approval_id TEXT,
      payload TEXT,
      status TEXT NOT NULL DEFAULT 'accepted' CHECK(status IN ('accepted', 'pending_approval', 'denied', 'replayed')),
      audit_status TEXT NOT NULL DEFAULT 'accepted',
      result_ref TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (actor_id) REFERENCES telegram_actor_mappings(actor_id)
    );
    CREATE INDEX IF NOT EXISTS idx_tg_intent_actor ON telegram_intent_envelopes(actor_id, created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_tg_intent_task ON telegram_intent_envelopes(task_id, created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_tg_intent_workspace ON telegram_intent_envelopes(workspace_id, created_at DESC);

    CREATE TABLE IF NOT EXISTS telegram_delivery_receipts (
      delivery_key TEXT PRIMARY KEY,
      task_id TEXT,
      workspace_id TEXT,
      run_id TEXT,
      intent_id TEXT,
      telegram_chat_id TEXT NOT NULL,
      status TEXT NOT NULL CHECK(status IN ('sent', 'failed', 'retry_pending')),
      attempts_count INTEGER NOT NULL DEFAULT 1,
      last_error TEXT,
      last_attempt_at TEXT NOT NULL,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (intent_id) REFERENCES telegram_intent_envelopes(intent_id)
    );
    CREATE INDEX IF NOT EXISTS idx_tg_delivery_task ON telegram_delivery_receipts(task_id, updated_at DESC);
    CREATE INDEX IF NOT EXISTS idx_tg_delivery_workspace ON telegram_delivery_receipts(workspace_id, updated_at DESC);
    CREATE INDEX IF NOT EXISTS idx_tg_delivery_run ON telegram_delivery_receipts(run_id, updated_at DESC);

    CREATE TABLE IF NOT EXISTS telegram_subscriptions (
      subscription_key TEXT PRIMARY KEY,
      actor_id TEXT,
      telegram_chat_id TEXT NOT NULL,
      task_id TEXT,
      workspace_id TEXT,
      run_id TEXT,
      status TEXT NOT NULL CHECK(status IN ('mute', 'unmute')),
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (actor_id) REFERENCES telegram_actor_mappings(actor_id)
    );
    CREATE INDEX IF NOT EXISTS idx_tg_subscription_chat ON telegram_subscriptions(telegram_chat_id, updated_at DESC);

    CREATE TABLE IF NOT EXISTS agent_profiles (
      profile_key TEXT PRIMARY KEY,
      display_name TEXT NOT NULL,
      runtime_role TEXT NOT NULL,
      provider TEXT NOT NULL,
      app TEXT NOT NULL,
      runtime_package TEXT NOT NULL,
      authority_scope TEXT NOT NULL,
      prohibited_actions TEXT NOT NULL,
      evidence_contract TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'draft' CHECK(status IN ('draft', 'active', 'disabled', 'retired')),
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      CHECK(runtime_role != profile_key),
      CHECK(profile_key NOT LIKE '/%')
    );

    CREATE TABLE IF NOT EXISTS registered_agents (
      agent_id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL,
      profile_key TEXT NOT NULL,
      display_name_override TEXT,
      identity_source TEXT NOT NULL DEFAULT 'manual' CHECK(identity_source IN ('seed', 'manual', 'legacy_migration', 'runtime_adapter')),
      status TEXT NOT NULL DEFAULT 'pending_review' CHECK(status IN ('pending_review', 'active', 'disabled', 'retired')),
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (profile_key) REFERENCES agent_profiles(profile_key)
    );

    CREATE TABLE IF NOT EXISTS workflow_phases (
      phase_key TEXT PRIMARY KEY,
      kind TEXT NOT NULL CHECK(kind IN ('explore', 'propose', 'spec', 'design', 'tasks', 'apply', 'verify', 'archive', 'custom')),
      writes_artifact TEXT,
      requires_artifacts TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active', 'disabled', 'retired')),
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      CHECK(phase_key NOT LIKE '/%')
    );

    CREATE TABLE IF NOT EXISTS capabilities (
      capability_key TEXT PRIMARY KEY,
      kind TEXT NOT NULL CHECK(kind IN ('mcp', 'git', 'filesystem', 'tests', 'docs', 'security-review', 'sdd-phase', 'approval', 'ops')),
      surface TEXT NOT NULL,
      allowed_tools TEXT NOT NULL,
      requires_permissions TEXT NOT NULL,
      approval_required_for TEXT NOT NULL,
      side_effect_class TEXT NOT NULL CHECK(side_effect_class IN ('none', 'read_only', 'repo_write', 'git_write', 'runtime_ops')),
      owner_system TEXT NOT NULL CHECK(owner_system IN ('devhub', 'opencode', 'external')),
      default_runtime TEXT,
      output_contract TEXT NOT NULL,
      evidence_contract TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active', 'disabled', 'retired')),
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS profile_capability_bindings (
      profile_key TEXT NOT NULL,
      capability_key TEXT NOT NULL,
      permission_level TEXT NOT NULL CHECK(permission_level IN ('deny', 'allow', 'allow_with_approval')),
      approval_required INTEGER NOT NULL DEFAULT 0,
      status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active', 'disabled')),
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (profile_key) REFERENCES agent_profiles(profile_key),
      FOREIGN KEY (capability_key) REFERENCES capabilities(capability_key),
      UNIQUE(profile_key, capability_key)
    );

    CREATE TABLE IF NOT EXISTS profile_phase_bindings (
      profile_key TEXT NOT NULL,
      phase_key TEXT NOT NULL,
      is_default INTEGER NOT NULL DEFAULT 0,
      status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active', 'disabled')),
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (profile_key) REFERENCES agent_profiles(profile_key),
      FOREIGN KEY (phase_key) REFERENCES workflow_phases(phase_key),
      UNIQUE(profile_key, phase_key)
    );

    -- Swarm process configuration
    CREATE TABLE IF NOT EXISTS swarm_config (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL,
      updated_at TEXT DEFAULT (datetime('now'))
    );

    -- Swarm process tracking
    CREATE TABLE IF NOT EXISTS swarm_processes (
      id TEXT PRIMARY KEY,
      pid INTEGER,
      port INTEGER NOT NULL,
      status TEXT DEFAULT 'starting',
      cwd TEXT,
      started_at TEXT DEFAULT (datetime('now')),
      last_heartbeat TEXT,
      metadata TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_swarm_processes_status ON swarm_processes(status);
    CREATE INDEX IF NOT EXISTS idx_swarm_processes_pid ON swarm_processes(pid);

    CREATE TABLE IF NOT EXISTS agent_workspaces (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL,
      agent_id TEXT NOT NULL,
      current_task_id TEXT,
      run_id_or_session_id TEXT,
      repo_root TEXT NOT NULL,
      workspace_path TEXT NOT NULL,
      worktree_path TEXT,
      base_branch TEXT NOT NULL,
      base_commit TEXT NOT NULL DEFAULT '${AGENT_WORKSPACE_BASE_COMMIT}',
      branch_name TEXT,
      status TEXT NOT NULL DEFAULT 'planned' CHECK(status IN (
        'planned',
        'provisioning',
        'ready',
        'active',
        'paused',
        'conflicted',
        'cleanup_pending',
        'completed',
        'failed',
        'orphaned'
      )),
      observed_branch TEXT,
      observed_head TEXT,
      observed_dirty TEXT CHECK(observed_dirty IN ('clean', 'dirty', 'dirty-excluded') OR observed_dirty IS NULL),
      last_error TEXT,
      last_error_class TEXT,
      recovery_reason TEXT,
      evidence_ref TEXT,
      reservation_token TEXT,
      correlation_id TEXT,
      accepted_at TEXT,
      claimed_at TEXT,
      started_at TEXT,
      updated_at TEXT DEFAULT (datetime('now')),
      completed_at TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      CHECK(
        status NOT IN ('ready', 'active') OR (
          branch_name IS NOT NULL AND
          worktree_path IS NOT NULL AND
          observed_branch IS NOT NULL AND
          observed_head IS NOT NULL
        )
      )
    );
    CREATE INDEX IF NOT EXISTS idx_agent_workspaces_project ON agent_workspaces(project_id);
    CREATE INDEX IF NOT EXISTS idx_agent_workspaces_agent ON agent_workspaces(agent_id);
    CREATE INDEX IF NOT EXISTS idx_agent_workspaces_status ON agent_workspaces(status);
    CREATE INDEX IF NOT EXISTS idx_agent_workspaces_task ON agent_workspaces(current_task_id);
    CREATE UNIQUE INDEX IF NOT EXISTS idx_agent_workspaces_active_branch
      ON agent_workspaces(branch_name)
      WHERE branch_name IS NOT NULL AND status IN ('planned', 'provisioning', 'ready', 'active', 'paused', 'cleanup_pending', 'orphaned');
    CREATE UNIQUE INDEX IF NOT EXISTS idx_agent_workspaces_active_worktree
      ON agent_workspaces(worktree_path)
      WHERE worktree_path IS NOT NULL AND status IN ('planned', 'provisioning', 'ready', 'active', 'paused', 'cleanup_pending', 'orphaned');
    CREATE UNIQUE INDEX IF NOT EXISTS idx_agent_workspaces_active_owner
      ON agent_workspaces(agent_id, current_task_id)
      WHERE current_task_id IS NOT NULL AND status IN ('planned', 'provisioning', 'ready', 'active', 'paused', 'cleanup_pending', 'orphaned');
    CREATE TRIGGER IF NOT EXISTS agent_workspaces_terminal_immutable
    BEFORE UPDATE ON agent_workspaces
    FOR EACH ROW
    WHEN OLD.status IN ('completed', 'failed')
    BEGIN
      SELECT RAISE(ABORT, 'agent_workspaces_terminal_immutable');
    END;

    CREATE TABLE IF NOT EXISTS agent_runs (
      run_id TEXT PRIMARY KEY,
      workspace_id TEXT NOT NULL,
      task_id TEXT,
      agent_id TEXT NOT NULL,
      requested_base_ref TEXT NOT NULL,
      baseline_commit TEXT NOT NULL,
      observed_start_branch TEXT,
      observed_start_head TEXT,
      observed_start_dirty TEXT CHECK(observed_start_dirty IN ('clean', 'dirty', 'dirty-excluded') OR observed_start_dirty IS NULL),
      observed_start_path TEXT,
      status TEXT NOT NULL DEFAULT 'planned' CHECK(status IN ('planned', 'running', 'paused', 'succeeded', 'failed', 'aborted', 'superseded')),
      predecessor_run_id TEXT,
      recovery_group_id TEXT,
      terminal_reason_class TEXT,
      started_at TEXT DEFAULT (datetime('now')),
      completed_at TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (workspace_id) REFERENCES agent_workspaces(id),
      FOREIGN KEY (predecessor_run_id) REFERENCES agent_runs(run_id),
      CHECK(predecessor_run_id IS NULL OR predecessor_run_id != run_id)
    );
    CREATE INDEX IF NOT EXISTS idx_agent_runs_workspace ON agent_runs(workspace_id, created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_agent_runs_task ON agent_runs(task_id, created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_agent_runs_agent ON agent_runs(agent_id, created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_agent_runs_recovery_group ON agent_runs(recovery_group_id, created_at DESC);

    CREATE TRIGGER IF NOT EXISTS agent_runs_provenance_immutable
    BEFORE UPDATE ON agent_runs
    FOR EACH ROW
    WHEN
      OLD.workspace_id IS NOT NEW.workspace_id OR
      OLD.task_id IS NOT NEW.task_id OR
      OLD.agent_id IS NOT NEW.agent_id OR
      OLD.requested_base_ref IS NOT NEW.requested_base_ref OR
      OLD.baseline_commit IS NOT NEW.baseline_commit OR
      OLD.observed_start_branch IS NOT NEW.observed_start_branch OR
      OLD.observed_start_head IS NOT NEW.observed_start_head OR
      OLD.observed_start_dirty IS NOT NEW.observed_start_dirty OR
      OLD.observed_start_path IS NOT NEW.observed_start_path OR
      OLD.predecessor_run_id IS NOT NEW.predecessor_run_id OR
      OLD.recovery_group_id IS NOT NEW.recovery_group_id OR
      OLD.started_at IS NOT NEW.started_at
    BEGIN
      SELECT RAISE(ABORT, 'agent_runs_provenance_immutable');
    END;

    CREATE TABLE IF NOT EXISTS agent_artifacts (
      artifact_id TEXT PRIMARY KEY,
      run_id TEXT NOT NULL,
      seq INTEGER NOT NULL,
      phase TEXT NOT NULL CHECK(phase IN ('prepare', 'execute', 'qa', 'cleanup', 'recovery')),
      kind TEXT NOT NULL CHECK(kind IN (
        'workspace.prepared',
        'workspace.drift',
        'workspace.cleanup',
        'git.branch',
        'git.commit',
        'git.merge',
        'git.checkout',
        'command.exec',
        'test.result',
        'diff.patch',
        'qa.result',
        'attachment.log',
        'attachment.file',
        'decision.note',
        'error.report'
      )),
      producer TEXT NOT NULL CHECK(producer IN ('executor', 'devhub', 'qa', 'supervisor')),
      summary TEXT NOT NULL,
      evidence_ref TEXT NOT NULL,
      evidence_kind TEXT,
      evidence_locator TEXT,
      evidence_version TEXT,
      parent_artifact_id TEXT,
      supersedes_artifact_id TEXT,
      content_digest TEXT,
      locator_version TEXT,
      observed_at TEXT NOT NULL,
      created_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (run_id) REFERENCES agent_runs(run_id) ON DELETE CASCADE,
      FOREIGN KEY (parent_artifact_id) REFERENCES agent_artifacts(artifact_id),
      FOREIGN KEY (supersedes_artifact_id) REFERENCES agent_artifacts(artifact_id),
      UNIQUE(run_id, seq)
    );
    CREATE INDEX IF NOT EXISTS idx_agent_artifacts_run_seq ON agent_artifacts(run_id, seq ASC);
    CREATE INDEX IF NOT EXISTS idx_agent_artifacts_kind ON agent_artifacts(kind, observed_at DESC);
    CREATE INDEX IF NOT EXISTS idx_agent_artifacts_phase ON agent_artifacts(phase, observed_at DESC);

    CREATE TRIGGER IF NOT EXISTS agent_artifacts_append_only
    BEFORE UPDATE ON agent_artifacts
    FOR EACH ROW
    BEGIN
      SELECT RAISE(ABORT, 'agent_artifacts_append_only');
    END;

    CREATE TRIGGER IF NOT EXISTS agent_artifacts_delete_forbidden
    BEFORE DELETE ON agent_artifacts
    FOR EACH ROW
    BEGIN
      SELECT RAISE(ABORT, 'agent_artifacts_append_only');
    END;

    CREATE TABLE IF NOT EXISTS supervisor_snapshots (
      task_id TEXT PRIMARY KEY,
      supervisor_state TEXT NOT NULL CHECK(supervisor_state IN (
        'idle',
        'dispatch_pending',
        'lease_active',
        'awaiting_evidence',
        'retry_pending',
        'blocked',
        'awaiting_approval',
        'recovering_orphan',
        'closed'
      )),
      outcome TEXT CHECK(outcome IN (
        'wait',
        'dispatch',
        'retry',
        'block',
        'recover_orphan',
        'request_approval',
        'close'
      ) OR outcome IS NULL),
      reason_class TEXT CHECK(reason_class IN (
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
        'completed'
      ) OR reason_class IS NULL),
      task_retry_count INTEGER NOT NULL DEFAULT 0,
      attempt_count INTEGER NOT NULL DEFAULT 0,
      unchanged_failure_count INTEGER NOT NULL DEFAULT 0,
      approval_request_count INTEGER NOT NULL DEFAULT 0,
      orphan_recovery_count INTEGER NOT NULL DEFAULT 0,
      workspace_id TEXT,
      run_id TEXT,
      evidence_ref TEXT,
      approval_checkpoint_key TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (workspace_id) REFERENCES agent_workspaces(id),
      FOREIGN KEY (run_id) REFERENCES agent_runs(run_id),
      FOREIGN KEY (approval_checkpoint_key) REFERENCES supervisor_approval_checkpoints(checkpoint_key)
    );
    CREATE INDEX IF NOT EXISTS idx_supervisor_snapshots_state ON supervisor_snapshots(supervisor_state);
    CREATE INDEX IF NOT EXISTS idx_supervisor_snapshots_workspace ON supervisor_snapshots(workspace_id);
    CREATE INDEX IF NOT EXISTS idx_supervisor_snapshots_run ON supervisor_snapshots(run_id);

    CREATE TABLE IF NOT EXISTS supervisor_approval_checkpoints (
      checkpoint_key TEXT PRIMARY KEY,
      task_id TEXT NOT NULL,
      workspace_id TEXT,
      run_id TEXT,
      reason_class TEXT NOT NULL CHECK(reason_class IN (
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
        'completed'
      )),
      evidence_ref TEXT,
      status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending', 'approved', 'rejected')),
      requested_at TEXT NOT NULL,
      decided_at TEXT,
      decision_note TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (workspace_id) REFERENCES agent_workspaces(id),
      FOREIGN KEY (run_id) REFERENCES agent_runs(run_id)
    );
    CREATE INDEX IF NOT EXISTS idx_supervisor_approval_task ON supervisor_approval_checkpoints(task_id);
    CREATE INDEX IF NOT EXISTS idx_supervisor_approval_status ON supervisor_approval_checkpoints(status);

    CREATE TABLE IF NOT EXISTS swarm_missions (
      mission_id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL,
      task_id TEXT,
      workspace_id TEXT,
      run_id TEXT,
      approval_checkpoint_key TEXT,
      owner_agent_id TEXT NOT NULL,
      kind TEXT NOT NULL CHECK(kind IN ('task_execution', 'sdd_phase', 'review', 'recovery', 'coordination')),
      status TEXT NOT NULL DEFAULT 'planned' CHECK(status IN ('planned', 'active', 'paused', 'completed', 'failed', 'aborted')),
      title TEXT NOT NULL,
      summary TEXT,
      evidence_ref TEXT,
      started_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      completed_at TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (project_id) REFERENCES projects(id),
      FOREIGN KEY (workspace_id) REFERENCES agent_workspaces(id),
      FOREIGN KEY (run_id) REFERENCES agent_runs(run_id),
      FOREIGN KEY (approval_checkpoint_key) REFERENCES supervisor_approval_checkpoints(checkpoint_key)
    );
    CREATE INDEX IF NOT EXISTS idx_swarm_missions_project_status ON swarm_missions(project_id, status, updated_at DESC);
    CREATE INDEX IF NOT EXISTS idx_swarm_missions_task ON swarm_missions(task_id, updated_at DESC);
    CREATE INDEX IF NOT EXISTS idx_swarm_missions_workspace ON swarm_missions(workspace_id, updated_at DESC);
    CREATE INDEX IF NOT EXISTS idx_swarm_missions_run ON swarm_missions(run_id, updated_at DESC);

    CREATE TABLE IF NOT EXISTS mission_participants (
      participant_id TEXT PRIMARY KEY,
      mission_id TEXT NOT NULL,
      agent_id TEXT NOT NULL,
      role_in_mission TEXT NOT NULL CHECK(role_in_mission IN ('director', 'executor', 'reviewer', 'observer')),
      status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('invited', 'active', 'paused', 'completed', 'removed')),
      joined_at TEXT NOT NULL,
      left_at TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL,
      FOREIGN KEY (mission_id) REFERENCES swarm_missions(mission_id) ON DELETE CASCADE,
      UNIQUE(mission_id, agent_id)
    );
    CREATE INDEX IF NOT EXISTS idx_mission_participants_agent ON mission_participants(agent_id, status);
    CREATE INDEX IF NOT EXISTS idx_mission_participants_mission_role ON mission_participants(mission_id, role_in_mission);

    CREATE TABLE IF NOT EXISTS mission_messages (
      message_id TEXT PRIMARY KEY,
      mission_id TEXT NOT NULL,
      sender_agent_id TEXT,
      message_kind TEXT NOT NULL CHECK(message_kind IN ('directive', 'status', 'handoff', 'decision', 'risk', 'approval_request', 'approval_result')),
      body_summary TEXT NOT NULL,
      evidence_ref TEXT,
      related_task_id TEXT,
      related_workspace_id TEXT,
      related_run_id TEXT,
      related_artifact_id TEXT,
      related_approval_checkpoint_key TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      FOREIGN KEY (mission_id) REFERENCES swarm_missions(mission_id) ON DELETE CASCADE,
      FOREIGN KEY (related_workspace_id) REFERENCES agent_workspaces(id),
      FOREIGN KEY (related_run_id) REFERENCES agent_runs(run_id),
      FOREIGN KEY (related_artifact_id) REFERENCES agent_artifacts(artifact_id),
      FOREIGN KEY (related_approval_checkpoint_key) REFERENCES supervisor_approval_checkpoints(checkpoint_key)
    );
    CREATE INDEX IF NOT EXISTS idx_mission_messages_mission_created ON mission_messages(mission_id, created_at ASC);
    CREATE INDEX IF NOT EXISTS idx_mission_messages_workspace ON mission_messages(related_workspace_id, created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_mission_messages_run ON mission_messages(related_run_id, created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_mission_messages_approval ON mission_messages(related_approval_checkpoint_key, created_at DESC);

    CREATE TABLE IF NOT EXISTS message_deliveries (
      delivery_id TEXT PRIMARY KEY,
      message_id TEXT NOT NULL,
      recipient_agent_id TEXT NOT NULL,
      channel TEXT NOT NULL,
      status TEXT NOT NULL CHECK(status IN ('pending', 'sent', 'failed', 'retry_pending', 'expired')),
      delivery_ref TEXT,
      evidence_ref TEXT,
      last_error TEXT,
      attempt_count INTEGER NOT NULL DEFAULT 1,
      last_attempt_at TEXT NOT NULL,
      acked_at TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL,
      FOREIGN KEY (message_id) REFERENCES mission_messages(message_id) ON DELETE CASCADE,
      UNIQUE(message_id, recipient_agent_id, channel)
    );
    CREATE INDEX IF NOT EXISTS idx_message_deliveries_recipient_status ON message_deliveries(recipient_agent_id, status, last_attempt_at DESC);
    CREATE INDEX IF NOT EXISTS idx_message_deliveries_message_status ON message_deliveries(message_id, status, updated_at DESC);

    CREATE TABLE IF NOT EXISTS agent_presence (
      presence_id TEXT PRIMARY KEY,
      mission_id TEXT,
      agent_id TEXT NOT NULL,
      workspace_id TEXT,
      run_id TEXT,
      runtime_surface TEXT NOT NULL,
      presence_state TEXT NOT NULL CHECK(presence_state IN ('online', 'busy', 'idle', 'waiting', 'offline')),
      status_summary TEXT,
      evidence_ref TEXT,
      last_seen_at TEXT NOT NULL,
      expires_at TEXT NOT NULL,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL,
      FOREIGN KEY (mission_id) REFERENCES swarm_missions(mission_id) ON DELETE CASCADE,
      FOREIGN KEY (workspace_id) REFERENCES agent_workspaces(id),
      FOREIGN KEY (run_id) REFERENCES agent_runs(run_id),
      UNIQUE(agent_id, mission_id, runtime_surface)
    );
    CREATE INDEX IF NOT EXISTS idx_agent_presence_agent_expires ON agent_presence(agent_id, expires_at DESC);
    CREATE INDEX IF NOT EXISTS idx_agent_presence_mission_expires ON agent_presence(mission_id, expires_at DESC);
  `);

  // ALTER TABLE statements — wrapped in try-catch since columns may already exist
  const alterStatements = [
    "ALTER TABLE projects ADD COLUMN documentation_policy TEXT DEFAULT 'personal'",
    'ALTER TABLE tasks ADD COLUMN claimed_at TEXT',
    'ALTER TABLE tasks ADD COLUMN lease_expires_at TEXT',
    'ALTER TABLE tasks ADD COLUMN claim_token TEXT',
    'ALTER TABLE agent_hub_sessions ADD COLUMN telegram_chat_id TEXT',
    'ALTER TABLE agent_hub_sessions ADD COLUMN directory TEXT',
    "ALTER TABLE agent_hub_sessions ADD COLUMN status TEXT DEFAULT 'active'",
    'ALTER TABLE agent_hub_sessions ADD COLUMN opencode_session_id TEXT',
    "ALTER TABLE agent_hub_messages ADD COLUMN source TEXT DEFAULT 'web'",
    'ALTER TABLE agent_hub_messages ADD COLUMN tool_call_id TEXT',
    'ALTER TABLE agent_hub_messages ADD COLUMN tool_name TEXT',
    'ALTER TABLE agent_traces ADD COLUMN message_id TEXT',
    'ALTER TABLE agent_traces ADD COLUMN part_id TEXT',
    'ALTER TABLE agent_traces ADD COLUMN updated_at TEXT',
    'ALTER TABLE agent_hub_sessions ADD COLUMN parent_id TEXT',
    'ALTER TABLE agent_hub_sessions ADD COLUMN custom_name TEXT',
    "ALTER TABLE agent_hub_sessions ADD COLUMN visibility TEXT DEFAULT 'visible'",
    'ALTER TABLE agent_hub_sessions ADD COLUMN error_message TEXT',
    'ALTER TABLE agent_workspaces ADD COLUMN last_error_class TEXT',
    'ALTER TABLE agent_workspaces ADD COLUMN reservation_token TEXT',
    'ALTER TABLE agent_workspaces ADD COLUMN correlation_id TEXT',
    'ALTER TABLE agent_workspaces ADD COLUMN accepted_at TEXT',
  ];
  for (const stmt of alterStatements) {
    try {
      db.exec(stmt);
    } catch (e) {
      // Ignore "duplicate column" errors — column already exists
      if (!e.message.includes('duplicate column name') && !e.message.includes('no such table')) {
        throw e;
      }
    }
  }

  db.exec(
    "UPDATE projects SET documentation_policy = 'personal' WHERE documentation_policy IS NULL"
  );

  // Composite unique index for idempotent trace upserts (session_id + part_id)
  db.exec(`
    CREATE UNIQUE INDEX IF NOT EXISTS idx_traces_session_part 
      ON agent_traces(session_id, part_id);
  `);

  // Index on parent_id — must run AFTER ALTER TABLE adds the column
  db.exec(
    `CREATE INDEX IF NOT EXISTS idx_agent_hub_sessions_parent ON agent_hub_sessions(parent_id)`
  );

  try {
    db.exec(`CREATE INDEX IF NOT EXISTS idx_tasks_lease_expires ON tasks(lease_expires_at)`);
  } catch (e) {
    if (!e.message.includes('no such table')) throw e;
  }

  try {
    db.exec(`CREATE INDEX IF NOT EXISTS idx_tasks_claim_token ON tasks(claim_token)`);
  } catch (e) {
    if (!e.message.includes('no such table')) throw e;
  }

  db.exec(`
    CREATE UNIQUE INDEX IF NOT EXISTS idx_usage_session_unique
      ON agent_session_usage(session_id);
  `);

  // Index on parent_id — must run AFTER ALTER TABLE adds the column
  db.exec(
    `CREATE INDEX IF NOT EXISTS idx_agent_hub_sessions_parent ON agent_hub_sessions(parent_id)`
  );

  db.exec(
    `CREATE UNIQUE INDEX IF NOT EXISTS idx_agent_workspaces_active_branch
      ON agent_workspaces(branch_name)
      WHERE branch_name IS NOT NULL AND status IN (${AGENT_WORKSPACE_ACTIVE_LOCK_STATUSES.map((status) => `'${status}'`).join(', ')})`
  );

  db.exec(
    `CREATE UNIQUE INDEX IF NOT EXISTS idx_agent_workspaces_active_worktree
      ON agent_workspaces(worktree_path)
      WHERE worktree_path IS NOT NULL AND status IN (${AGENT_WORKSPACE_ACTIVE_LOCK_STATUSES.map((status) => `'${status}'`).join(', ')})`
  );

  db.exec(
    `CREATE UNIQUE INDEX IF NOT EXISTS idx_agent_workspaces_active_owner
      ON agent_workspaces(agent_id, current_task_id)
      WHERE current_task_id IS NOT NULL AND status IN (${AGENT_WORKSPACE_ACTIVE_LOCK_STATUSES.map((status) => `'${status}'`).join(', ')})`
  );

  db.exec(`
    CREATE TRIGGER IF NOT EXISTS agent_workspaces_terminal_immutable
    BEFORE UPDATE ON agent_workspaces
    FOR EACH ROW
    WHEN OLD.status IN (${AGENT_WORKSPACE_TERMINAL_STATUSES.map((status) => `'${status}'`).join(', ')})
    BEGIN
      SELECT RAISE(ABORT, 'agent_workspaces_terminal_immutable');
    END;
  `);
}

function getDb() {
  if (!_db) {
    const dir = path.dirname(DB_PATH);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    _db = new Database(DB_PATH, { fileMustExist: false, readonly: false });
    _db.pragma('journal_mode = WAL');
    _db.pragma('foreign_keys = ON');
    _db.pragma('busy_timeout = 5000');
    ensureRuntimeSchema(_db);
  }
  if (!_db.tables) {
    _db.tables = tables;
  }
  return _db;
}

function closeDb() {
  if (_db) {
    _db.close();
    _db = null;
  }
}

function buildSelectQuery(table, options = {}) {
  const { select = '*', where = [], orderBy = [], limit = null } = options;
  let sql = `SELECT ${select} FROM ${table}`;
  const params = [];
  if (where.length > 0) {
    const conditions = where.map(([col, op, _val]) => {
      params.push(_val);
      return `${col} ${op} ?`;
    });
    sql += ` WHERE ${conditions.join(' AND ')}`;
  }
  if (orderBy.length > 0) {
    sql += ` ORDER BY ${orderBy.map(([col, dir]) => `${col} ${dir.toUpperCase()}`).join(', ')}`;
  }
  if (limit) {
    sql += ` LIMIT ?`;
    params.push(limit);
  }
  return { sql, params };
}

function buildWhere(where) {
  if (!where || where.length === 0) return { clauses: ['1=1'], values: [] };
  const clauses = [];
  const values = [];
  for (const [col, op, val] of where) {
    if (op === 'IN') {
      if (!Array.isArray(val) || val.length === 0) {
        clauses.push('1=0');
      } else {
        clauses.push(`${col} IN (${val.map(() => '?').join(', ')})`);
        values.push(...val);
      }
      continue;
    }
    if (op === 'IS NOT' && val === null) {
      clauses.push(`${col} IS NOT NULL`);
      continue;
    }
    clauses.push(`${col} ${op} ?`);
    values.push(val);
  }
  return { clauses, values };
}

function tableExists(db, tableName) {
  return Boolean(
    db.prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?").get(tableName)
  );
}

function tableHasColumn(db, tableName, columnName) {
  if (!tableExists(db, tableName)) return false;
  return db
    .prepare(`PRAGMA table_info(${tableName})`)
    .all()
    .some((column) => column.name === columnName);
}

function buildWorkspaceIntentId(taskId, agentId) {
  return `workspace-${taskId}-${agentId}`;
}

function validatePrepareAgentWorkspaceIdentity({
  workspace_id,
  task_id,
  agent_id,
  correlation_id,
}) {
  const hasWorkspaceId = Boolean(workspace_id);
  const hasTaskIdentity = Boolean(task_id || agent_id);
  const hasCompleteTaskIdentity = Boolean(task_id && agent_id);

  if (!correlation_id) {
    throw new Error('correlation_id es requerido.');
  }

  if (!hasWorkspaceId && hasTaskIdentity && !hasCompleteTaskIdentity) {
    throw new Error('task_id y agent_id deben enviarse juntos.');
  }

  if (!hasWorkspaceId && !hasCompleteTaskIdentity) {
    throw new Error('Se requiere exactamente una identidad: workspace_id o task_id + agent_id.');
  }

  if (hasWorkspaceId && hasTaskIdentity) {
    throw new Error('workspace_id no puede combinarse con task_id o agent_id.');
  }
}

function resolvePreparationProjectId(db, taskId) {
  if (!taskId || !tableExists(db, 'tasks')) return 'control-plane-pending';
  const task = db.prepare('SELECT project_id FROM tasks WHERE id = ? LIMIT 1').get(taskId);
  return task?.project_id || 'control-plane-pending';
}

function buildPrepareAgentWorkspaceAck(workspace) {
  return {
    workspace_id: workspace.id,
    task_id: workspace.current_task_id,
    agent_id: workspace.agent_id,
    requested_base_ref: workspace.base_commit,
    reservation_token: workspace.reservation_token,
    correlation_id: workspace.correlation_id,
    status: workspace.status,
    accepted_at: workspace.accepted_at || workspace.updated_at || workspace.created_at || null,
  };
}

function resolveDbArgs(dbOrInput, maybeInput) {
  if (dbOrInput && typeof dbOrInput.prepare === 'function') {
    return { db: dbOrInput, input: maybeInput || {} };
  }
  return { db: getDb(), input: dbOrInput || {} };
}

function getAgentRunById(dbOrRunId, maybeRunId) {
  const hasDb = dbOrRunId && typeof dbOrRunId.prepare === 'function';
  const db = hasDb ? dbOrRunId : getDb();
  const runId = hasDb ? maybeRunId : dbOrRunId;
  if (!runId) return null;
  return db.prepare('SELECT * FROM agent_runs WHERE run_id = ? LIMIT 1').get(runId) || null;
}

function listAgentRuns(dbOrFilters, maybeFilters) {
  const { db, input } = resolveDbArgs(dbOrFilters, maybeFilters);
  const filters = input || {};
  const clauses = [];
  const params = [];

  if (filters.workspace_id) {
    clauses.push('workspace_id = ?');
    params.push(filters.workspace_id);
  }
  if (filters.task_id) {
    clauses.push('task_id = ?');
    params.push(filters.task_id);
  }
  if (filters.agent_id) {
    clauses.push('agent_id = ?');
    params.push(filters.agent_id);
  }
  if (filters.recovery_group_id) {
    clauses.push('recovery_group_id = ?');
    params.push(filters.recovery_group_id);
  }

  const whereSql = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
  const limitSql = Number.isInteger(filters.limit) ? ' LIMIT ?' : '';
  const statement = db.prepare(
    `SELECT * FROM agent_runs ${whereSql} ORDER BY created_at DESC, rowid DESC${limitSql}`
  );
  if (Number.isInteger(filters.limit)) params.push(filters.limit);
  return statement.all(...params);
}

function getLatestAgentRunForWorkspace(dbOrWorkspaceId, maybeWorkspaceId) {
  const hasDb = dbOrWorkspaceId && typeof dbOrWorkspaceId.prepare === 'function';
  const db = hasDb ? dbOrWorkspaceId : getDb();
  const workspaceId = hasDb ? maybeWorkspaceId : dbOrWorkspaceId;
  if (!workspaceId) return null;
  return (
    db
      .prepare(
        'SELECT * FROM agent_runs WHERE workspace_id = ? ORDER BY created_at DESC, rowid DESC LIMIT 1'
      )
      .get(workspaceId) || null
  );
}

function getLatestAgentRunForTask(dbOrTaskId, maybeTaskId) {
  const hasDb = dbOrTaskId && typeof dbOrTaskId.prepare === 'function';
  const db = hasDb ? dbOrTaskId : getDb();
  const taskId = hasDb ? maybeTaskId : dbOrTaskId;
  if (!taskId) return null;
  return (
    db
      .prepare(
        'SELECT * FROM agent_runs WHERE task_id = ? ORDER BY created_at DESC, rowid DESC LIMIT 1'
      )
      .get(taskId) || null
  );
}

function getPreferredBindingWorkspace(db, { project_id, agent_id, preferred_task_id } = {}) {
  if (!project_id || !agent_id) return null;
  return (
    db
      .prepare(
        `SELECT *
         FROM agent_workspaces
         WHERE project_id = ?
           AND agent_id = ?
           AND status IN ('planned', 'provisioning', 'ready', 'active', 'paused', 'cleanup_pending', 'orphaned')
         ORDER BY CASE WHEN current_task_id = ? THEN 0 ELSE 1 END, updated_at DESC, rowid DESC
         LIMIT 1`
      )
      .get(project_id, agent_id, preferred_task_id || '') || null
  );
}

function buildMissingRuntimeBinding(agentId, overrides = {}) {
  return {
    classification: 'missing',
    status: 'unbound',
    reason: 'binding_missing',
    agent_id: agentId,
    workspace_id: overrides.workspace_id || null,
    run_id: null,
    run_id_or_session_id: overrides.run_id_or_session_id || null,
    session_id: null,
    opencode_session_id: null,
    agent_model: null,
    cwd: overrides.cwd || null,
  };
}

function resolveAgentRuntimeBinding(dbOrInput, maybeInput) {
  const { db, input } = resolveDbArgs(dbOrInput, maybeInput);
  const projectId = input.project_id;
  const agentId = input.agent_id;

  if (!projectId) throw new Error('project_id es requerido para resolveAgentRuntimeBinding.');
  if (!agentId) throw new Error('agent_id es requerido para resolveAgentRuntimeBinding.');

  const workspace = getPreferredBindingWorkspace(db, {
    project_id: projectId,
    agent_id: agentId,
    preferred_task_id: input.preferred_task_id || null,
  });

  if (!workspace) {
    return buildMissingRuntimeBinding(agentId);
  }

  const run = getLatestAgentRunForWorkspace(db, workspace.id);
  if (!run) {
    return buildMissingRuntimeBinding(agentId, {
      workspace_id: workspace.id,
      run_id_or_session_id: workspace.run_id_or_session_id || null,
      cwd: workspace.repo_root || null,
    });
  }

  return {
    classification: 'bound',
    status: 'bound',
    reason: 'binding_found',
    agent_id: agentId,
    workspace_id: workspace.id,
    run_id: run.run_id,
    run_id_or_session_id: workspace.run_id_or_session_id || null,
    session_id: null,
    opencode_session_id: null,
    agent_model: null,
    cwd: workspace.repo_root || null,
  };
}

function buildMissionBindingResult(binding = {}, overrides = {}) {
  return {
    status: overrides.status || binding.status || 'unbound',
    classification: overrides.classification || binding.classification || 'missing',
    agent_id: overrides.agent_id || binding.agent_id || null,
    session_id: Object.prototype.hasOwnProperty.call(overrides, 'session_id')
      ? overrides.session_id
      : binding.session_id || null,
    opencode_session_id: Object.prototype.hasOwnProperty.call(overrides, 'opencode_session_id')
      ? overrides.opencode_session_id
      : binding.opencode_session_id || null,
    workspace_id: Object.prototype.hasOwnProperty.call(overrides, 'workspace_id')
      ? overrides.workspace_id
      : binding.workspace_id || null,
    run_id: Object.prototype.hasOwnProperty.call(overrides, 'run_id')
      ? overrides.run_id
      : binding.run_id || null,
    run_id_or_session_id: Object.prototype.hasOwnProperty.call(overrides, 'run_id_or_session_id')
      ? overrides.run_id_or_session_id
      : binding.run_id_or_session_id || null,
    reason: overrides.reason || binding.reason || 'binding_missing',
    agent_model: Object.prototype.hasOwnProperty.call(overrides, 'agent_model')
      ? overrides.agent_model
      : binding.agent_model || null,
    cwd: Object.prototype.hasOwnProperty.call(overrides, 'cwd')
      ? overrides.cwd
      : binding.cwd || null,
  };
}

function createAgentRun(dbOrInput, maybeInput) {
  const { db, input } = resolveDbArgs(dbOrInput, maybeInput);
  const timestamp = input.started_at || new Date().toISOString();
  const status = input.status || 'planned';
  if (!isAgentRunStatus(status)) {
    throw new Error(`Agent run status inválido: ${status}`);
  }
  if (!input.workspace_id) throw new Error('workspace_id es requerido para agent_runs.');
  if (!input.agent_id) throw new Error('agent_id es requerido para agent_runs.');
  if (!input.requested_base_ref)
    throw new Error('requested_base_ref es requerido para agent_runs.');
  if (!input.baseline_commit) throw new Error('baseline_commit es requerido para agent_runs.');
  if (
    input.observed_start?.dirty &&
    !AGENT_RUN_OBSERVED_DIRTY_STATUSES.includes(input.observed_start.dirty)
  ) {
    throw new Error(`observed_start.dirty inválido: ${input.observed_start.dirty}`);
  }
  if (input.predecessor_run_id && !getAgentRunById(db, input.predecessor_run_id)) {
    throw new Error(`predecessor_run_id no encontrado: ${input.predecessor_run_id}`);
  }

  const row = {
    run_id: input.run_id || crypto.randomUUID(),
    workspace_id: input.workspace_id,
    task_id: input.task_id || null,
    agent_id: input.agent_id,
    requested_base_ref: input.requested_base_ref,
    baseline_commit: input.baseline_commit,
    observed_start_branch: input.observed_start?.branch || null,
    observed_start_head: input.observed_start?.head || null,
    observed_start_dirty: input.observed_start?.dirty || null,
    observed_start_path: input.observed_start?.path || null,
    status,
    predecessor_run_id: input.predecessor_run_id || null,
    recovery_group_id: input.recovery_group_id || null,
    terminal_reason_class: input.terminal_reason_class || null,
    started_at: timestamp,
    completed_at: input.completed_at || null,
    created_at: timestamp,
    updated_at: timestamp,
  };

  const keys = Object.keys(row);
  db.prepare(
    `INSERT INTO agent_runs (${keys.join(', ')}) VALUES (${keys.map(() => '?').join(', ')})`
  ).run(...keys.map((key) => row[key] ?? null));

  return getAgentRunById(db, row.run_id);
}

function updateAgentRunTerminal(dbOrRunId, maybeRunId, maybeUpdates) {
  const hasDb = dbOrRunId && typeof dbOrRunId.prepare === 'function';
  const db = hasDb ? dbOrRunId : getDb();
  const runId = hasDb ? maybeRunId : dbOrRunId;
  const updates = hasDb ? maybeUpdates || {} : maybeRunId || {};
  const existing = getAgentRunById(db, runId);
  if (!existing) throw new Error(`agent_run ${runId} no encontrado.`);
  const status = updates.status || existing.status;
  if (!isTerminalAgentRunStatus(status)) {
    throw new Error(`Estado terminal inválido para agent_run: ${status}`);
  }

  const payload = {
    status,
    terminal_reason_class: updates.terminal_reason_class || existing.terminal_reason_class || null,
    completed_at: updates.completed_at || new Date().toISOString(),
    updated_at: updates.updated_at || new Date().toISOString(),
  };
  const keys = Object.keys(payload);
  db.prepare(
    `UPDATE agent_runs SET ${keys.map((key) => `${key} = ?`).join(', ')} WHERE run_id = ?`
  ).run(...keys.map((key) => payload[key] ?? null), runId);
  return getAgentRunById(db, runId);
}

function listAgentArtifacts(dbOrRunId, maybeRunId) {
  const hasDb = dbOrRunId && typeof dbOrRunId.prepare === 'function';
  const db = hasDb ? dbOrRunId : getDb();
  const runId = hasDb ? maybeRunId : dbOrRunId;
  return db
    .prepare('SELECT * FROM agent_artifacts WHERE run_id = ? ORDER BY seq ASC, created_at ASC')
    .all(runId);
}

function getLatestAgentArtifactForRun(dbOrRunId, maybeRunId) {
  const hasDb = dbOrRunId && typeof dbOrRunId.prepare === 'function';
  const db = hasDb ? dbOrRunId : getDb();
  const runId = hasDb ? maybeRunId : dbOrRunId;
  return (
    db
      .prepare(
        'SELECT * FROM agent_artifacts WHERE run_id = ? ORDER BY seq DESC, created_at DESC LIMIT 1'
      )
      .get(runId) || null
  );
}

function appendAgentArtifact(dbOrInput, maybeInput) {
  const { db, input } = resolveDbArgs(dbOrInput, maybeInput);
  if (!input.run_id) throw new Error('run_id es requerido para agent_artifacts.');
  const run = getAgentRunById(db, input.run_id);
  if (!run) throw new Error(`agent_run ${input.run_id} no encontrado.`);

  validateAgentArtifactInput(input);
  const normalizedEvidenceRef = normalizeEvidenceRef(input.evidence_ref);
  const parsedEvidenceRef = parseEvidenceRef(normalizedEvidenceRef);
  const previous = getLatestAgentArtifactForRun(db, input.run_id);
  const nextSeq = input.seq || (previous?.seq || 0) + 1;
  if (previous && nextSeq <= previous.seq) {
    throw new Error(`agent_artifacts seq inválido para ${input.run_id}: ${nextSeq}`);
  }

  if (input.parent_artifact_id) {
    const parent = db
      .prepare('SELECT run_id FROM agent_artifacts WHERE artifact_id = ? LIMIT 1')
      .get(input.parent_artifact_id);
    if (!parent || parent.run_id !== input.run_id) {
      throw new Error(`parent_artifact_id inválido para ${input.parent_artifact_id}`);
    }
  }

  if (input.supersedes_artifact_id) {
    const supersedes = db
      .prepare('SELECT run_id FROM agent_artifacts WHERE artifact_id = ? LIMIT 1')
      .get(input.supersedes_artifact_id);
    if (!supersedes || supersedes.run_id !== input.run_id) {
      throw new Error(`supersedes_artifact_id inválido para ${input.supersedes_artifact_id}`);
    }
  }

  const integrity = input.integrity || {};
  const row = {
    artifact_id: input.artifact_id || crypto.randomUUID(),
    run_id: input.run_id,
    seq: nextSeq,
    phase: input.phase,
    kind: input.kind,
    producer: input.producer,
    summary: String(input.summary).trim(),
    evidence_ref: normalizedEvidenceRef,
    evidence_kind: parsedEvidenceRef.kind,
    evidence_locator: parsedEvidenceRef.locator,
    evidence_version: parsedEvidenceRef.version,
    parent_artifact_id: input.parent_artifact_id || null,
    supersedes_artifact_id: input.supersedes_artifact_id || null,
    content_digest: integrity.content_digest || null,
    locator_version: integrity.locator_version || null,
    observed_at: integrity.observed_at || input.observed_at || new Date().toISOString(),
  };

  const keys = Object.keys(row);
  db.prepare(
    `INSERT INTO agent_artifacts (${keys.join(', ')}) VALUES (${keys.map(() => '?').join(', ')})`
  ).run(...keys.map((key) => row[key] ?? null));

  return db
    .prepare('SELECT * FROM agent_artifacts WHERE artifact_id = ? LIMIT 1')
    .get(row.artifact_id);
}

function prepareAgentWorkspaceLease(db, input = {}, options = {}) {
  if (!db) throw new Error('Database handle requerido para prepareAgentWorkspaceLease.');

  validatePrepareAgentWorkspaceIdentity(input);

  const timestamp = options.acceptedAt || new Date().toISOString();
  const requestedBaseRef = input.requested_base_ref || AGENT_WORKSPACE_BASE_COMMIT;
  const repoRoot = options.repoRoot || process.cwd();
  const baseBranch = options.baseBranch || 'main';

  let workspace = null;
  let workspaceId = input.workspace_id || null;
  let taskId = input.task_id || null;
  let agentId = input.agent_id || null;

  if (workspaceId) {
    workspace = db.prepare('SELECT * FROM agent_workspaces WHERE id = ? LIMIT 1').get(workspaceId);
    if (!workspace) {
      throw new Error(`Workspace ${workspaceId} no encontrado.`);
    }
    taskId = workspace.current_task_id;
    agentId = workspace.agent_id;
  } else {
    workspace = db
      .prepare(
        'SELECT * FROM agent_workspaces WHERE current_task_id = ? AND agent_id = ? ORDER BY created_at DESC LIMIT 1'
      )
      .get(taskId, agentId);
    workspaceId = workspace?.id || buildWorkspaceIntentId(taskId, agentId);
  }

  if (workspace && workspace.correlation_id === input.correlation_id) {
    return {
      created: false,
      reused: true,
      workspace,
      ack: buildPrepareAgentWorkspaceAck(workspace),
    };
  }

  const reservationToken =
    input.reservation_token || workspace?.reservation_token || `rsv-${crypto.randomUUID()}`;
  const projectId = workspace?.project_id || resolvePreparationProjectId(db, taskId);
  const workspacePath =
    workspace?.workspace_path || input.workspace_path || `workspace://${projectId}/${workspaceId}`;
  const acceptedAt = timestamp;

  if (!workspace) {
    const row = {
      id: workspaceId,
      project_id: projectId,
      agent_id: agentId,
      current_task_id: taskId,
      run_id_or_session_id: null,
      repo_root: repoRoot,
      workspace_path: workspacePath,
      worktree_path: null,
      base_branch: baseBranch,
      base_commit: requestedBaseRef,
      branch_name: null,
      status: 'provisioning',
      observed_branch: null,
      observed_head: null,
      observed_dirty: null,
      last_error: null,
      last_error_class: null,
      recovery_reason: null,
      evidence_ref: null,
      reservation_token: reservationToken,
      correlation_id: input.correlation_id,
      accepted_at: acceptedAt,
      claimed_at: null,
      started_at: null,
      updated_at: timestamp,
      completed_at: null,
    };

    const keys = Object.keys(row);
    db.prepare(
      `INSERT INTO agent_workspaces (${keys.join(', ')}) VALUES (${keys.map(() => '?').join(', ')})`
    ).run(...keys.map((key) => row[key] ?? null));

    const created = db
      .prepare('SELECT * FROM agent_workspaces WHERE id = ? LIMIT 1')
      .get(workspaceId);
    return {
      created: true,
      reused: false,
      workspace: created,
      ack: buildPrepareAgentWorkspaceAck(created),
    };
  }

  const updates = {
    base_commit: requestedBaseRef,
    status: AGENT_WORKSPACE_TERMINAL_STATUSES.includes(workspace.status)
      ? workspace.status
      : 'provisioning',
    last_error: null,
    last_error_class: null,
    recovery_reason: null,
    reservation_token: reservationToken,
    correlation_id: input.correlation_id,
    accepted_at: acceptedAt,
    updated_at: timestamp,
  };

  const keys = Object.keys(updates);
  db.prepare(
    `UPDATE agent_workspaces SET ${keys.map((key) => `${key} = ?`).join(', ')} WHERE id = ?`
  ).run(...keys.map((key) => updates[key] ?? null), workspaceId);

  const updated = db
    .prepare('SELECT * FROM agent_workspaces WHERE id = ? LIMIT 1')
    .get(workspaceId);
  return {
    created: false,
    reused: false,
    workspace: updated,
    ack: buildPrepareAgentWorkspaceAck(updated),
  };
}

function isSupervisorState(value) {
  return SUPERVISOR_STATES.includes(value);
}

function isSupervisorOutcome(value) {
  return value == null || SUPERVISOR_OUTCOMES.includes(value);
}

function isSupervisorReasonClass(value) {
  return value == null || SUPERVISOR_REASON_CLASSES.includes(value);
}

function isSupervisorApprovalStatus(value) {
  return SUPERVISOR_APPROVAL_STATUSES.includes(value);
}

function isTelegramIntentAction(value) {
  return TELEGRAM_INTENT_ACTIONS.includes(value);
}

function isTelegramIntentStatus(value) {
  return TELEGRAM_INTENT_STATUSES.includes(value);
}

function isTelegramDeliveryStatus(value) {
  return TELEGRAM_DELIVERY_STATUSES.includes(value);
}

function isTelegramSubscriptionStatus(value) {
  return TELEGRAM_SUBSCRIPTION_STATUSES.includes(value);
}

function parseJsonField(value) {
  if (!value) return null;
  if (typeof value === 'object') return value;
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

function normalizeTelegramActorRow(row) {
  if (!row) return null;
  return {
    ...row,
    allowlisted: Number(row.allowlisted || 0),
    metadata: parseJsonField(row.metadata),
  };
}

function normalizeTelegramIntentRow(row) {
  if (!row) return null;
  return {
    ...row,
    payload: parseJsonField(row.payload),
  };
}

function normalizeTelegramDeliveryRow(row) {
  if (!row) return null;
  return {
    ...row,
    attempts_count: Number(row.attempts_count || 0),
  };
}

function normalizeTelegramSubscriptionRow(row) {
  if (!row) return null;
  return {
    ...row,
  };
}

function assertNoRuntimeOnlyFields(input, contextLabel) {
  const invalidField = RUNTIME_ONLY_FIELDS.find((key) =>
    Object.prototype.hasOwnProperty.call(input || {}, key)
  );
  if (invalidField) {
    throw new Error(`${contextLabel} no puede persistir runtime-only payload: ${invalidField}`);
  }
}

function assertNoCanonicalIdentityMetadata(input) {
  const invalidField = MISSION_IDENTITY_METADATA_FIELDS.find((key) =>
    Object.prototype.hasOwnProperty.call(input || {}, key)
  );
  if (invalidField) {
    throw new Error(
      `mission_participants no puede mezclar identity metadata canónica: ${invalidField}`
    );
  }
}

function buildMissionDeliveryKey({ message_id, recipient_agent_id, channel }) {
  return ['delivery', message_id || '-', recipient_agent_id || '-', channel || '-'].join('|');
}

function buildAgentPresenceKey({ mission_id = null, agent_id, runtime_surface }) {
  return ['presence', mission_id || '-', agent_id || '-', runtime_surface || '-'].join('|');
}

function isSwarmMissionStatus(value) {
  return SWARM_MISSION_STATUSES.includes(value);
}

function isSwarmMissionKind(value) {
  return SWARM_MISSION_KINDS.includes(value);
}

function isMissionParticipantRole(value) {
  return MISSION_PARTICIPANT_ROLES.includes(value);
}

function isMissionParticipantStatus(value) {
  return MISSION_PARTICIPANT_STATUSES.includes(value);
}

function isMissionMessageKind(value) {
  return MISSION_MESSAGE_KINDS.includes(value);
}

function isMissionDeliveryStatus(value) {
  return MISSION_DELIVERY_STATUSES.includes(value);
}

function isAgentPresenceState(value) {
  return AGENT_PRESENCE_STATES.includes(value);
}

function addPresenceTtl(lastSeenAt, ttlMs = AGENT_PRESENCE_TTL_MS) {
  const baseMs = Date.parse(lastSeenAt);
  if (Number.isNaN(baseMs)) throw new Error(`last_seen_at inválido: ${lastSeenAt}`);
  return new Date(baseMs + ttlMs).toISOString();
}

function getAgentPresenceStatus(presence = {}, options = {}) {
  const nowMs = Date.parse(options.now || new Date().toISOString());
  const expiresMs = Date.parse(presence.expires_at || addPresenceTtl(presence.last_seen_at));
  if (presence.presence_state === 'offline') {
    return { effective_state: 'offline', stale: false, expires_at: presence.expires_at || null };
  }
  if (!Number.isNaN(nowMs) && !Number.isNaN(expiresMs) && nowMs > expiresMs) {
    return { effective_state: 'stale', stale: true, expires_at: new Date(expiresMs).toISOString() };
  }
  return {
    effective_state: presence.presence_state || 'offline',
    stale: false,
    expires_at: presence.expires_at || null,
  };
}

function getSwarmMissionById(dbOrMissionId, maybeMissionId) {
  const hasDb = dbOrMissionId && typeof dbOrMissionId.prepare === 'function';
  const db = hasDb ? dbOrMissionId : getDb();
  const missionId = hasDb ? maybeMissionId : dbOrMissionId;
  if (!missionId) return null;
  return (
    db.prepare('SELECT * FROM swarm_missions WHERE mission_id = ? LIMIT 1').get(missionId) || null
  );
}

function listMissionParticipants(dbOrMissionId, maybeMissionId) {
  const hasDb = dbOrMissionId && typeof dbOrMissionId.prepare === 'function';
  const db = hasDb ? dbOrMissionId : getDb();
  const missionId = hasDb ? maybeMissionId : dbOrMissionId;
  return db
    .prepare(
      'SELECT * FROM mission_participants WHERE mission_id = ? ORDER BY joined_at ASC, rowid ASC'
    )
    .all(missionId);
}

function getVerifiedMissionRecipientBinding(dbOrInput, maybeInput) {
  const { db, input } = resolveDbArgs(dbOrInput, maybeInput);
  const missionId = input.mission_id;
  const recipientAgentId = input.recipient_agent_id;

  if (!missionId) throw new Error('mission_id es requerido para binding lookup.');
  if (!recipientAgentId) throw new Error('recipient_agent_id es requerido para binding lookup.');

  const mission = getSwarmMissionById(db, missionId);
  if (!mission) {
    return buildMissionBindingResult(null, {
      status: 'unbound',
      classification: 'missing',
      agent_id: recipientAgentId,
      session_id: null,
      opencode_session_id: null,
      workspace_id: null,
      run_id: null,
      run_id_or_session_id: null,
      reason: 'binding_missing',
      agent_model: null,
      cwd: null,
    });
  }

  const participant = db
    .prepare(
      `SELECT *
       FROM mission_participants
       WHERE mission_id = ? AND agent_id = ? AND status IN ('invited', 'active', 'paused')
       ORDER BY updated_at DESC, rowid DESC
       LIMIT 1`
    )
    .get(missionId, recipientAgentId);

  if (!participant) {
    return buildMissionBindingResult(null, {
      status: 'unbound',
      classification: 'missing',
      agent_id: recipientAgentId,
      session_id: null,
      opencode_session_id: null,
      workspace_id: null,
      run_id: null,
      run_id_or_session_id: null,
      reason: 'binding_missing',
      agent_model: null,
      cwd: null,
    });
  }
  const binding = resolveAgentRuntimeBinding(db, {
    project_id: mission.project_id,
    agent_id: recipientAgentId,
    preferred_task_id: mission.task_id || null,
  });

  if (binding.classification === 'missing') {
    return buildMissionBindingResult(binding, {
      status: 'unbound',
      classification: 'missing',
      agent_id: recipientAgentId,
    });
  }

  const workspace = binding.workspace_id
    ? getPreferredBindingWorkspace(db, {
        project_id: mission.project_id,
        agent_id: recipientAgentId,
        preferred_task_id: mission.task_id || null,
      })
    : null;
  const supervisor = mission.task_id ? getSupervisorSnapshot(db, mission.task_id) : null;
  const orphanedByDurableState =
    workspace?.status === 'orphaned' ||
    supervisor?.reason_class === 'orphaned_workspace' ||
    supervisor?.reason_class === 'orphaned_run';

  if (orphanedByDurableState) {
    return buildMissionBindingResult(binding, {
      status: 'unbound',
      classification: 'orphaned',
      session_id: binding.run_id_or_session_id || null,
      opencode_session_id: null,
      reason: 'binding_orphaned',
      agent_model: null,
      cwd: binding.cwd,
    });
  }

  const sessionId = binding.run_id_or_session_id || null;
  if (!sessionId) {
    return buildMissionBindingResult(binding, {
      status: 'unbound',
      classification: 'missing',
      session_id: null,
      opencode_session_id: null,
      reason: 'binding_missing',
      agent_model: null,
      cwd: binding.cwd,
    });
  }

  const session =
    db.prepare('SELECT * FROM agent_hub_sessions WHERE id = ? LIMIT 1').get(sessionId) || null;
  const opencodeSessionId = session?.opencode_session_id?.trim() || null;
  const isVerified = session && session.status === 'active' && opencodeSessionId;

  if (!isVerified) {
    return buildMissionBindingResult(binding, {
      status: 'unbound',
      classification: 'stale',
      session_id: sessionId,
      opencode_session_id: null,
      reason: 'binding_stale',
      agent_model: null,
      cwd: binding.cwd,
    });
  }

  return buildMissionBindingResult(binding, {
    status: 'bound',
    classification: 'bound',
    session_id: session.id,
    opencode_session_id: opencodeSessionId,
    reason: 'binding_found',
    agent_model: session.agent_model || null,
    cwd: session.directory || binding.cwd,
  });
}

function listMissionMessages(dbOrMissionId, maybeMissionId) {
  const hasDb = dbOrMissionId && typeof dbOrMissionId.prepare === 'function';
  const db = hasDb ? dbOrMissionId : getDb();
  const missionId = hasDb ? maybeMissionId : dbOrMissionId;
  return db
    .prepare(
      'SELECT * FROM mission_messages WHERE mission_id = ? ORDER BY created_at DESC, rowid DESC'
    )
    .all(missionId);
}

function listRecentMissionMessages(dbOrMissionId, maybeMissionId, maybeLimit = 20) {
  const hasDb = dbOrMissionId && typeof dbOrMissionId.prepare === 'function';
  const db = hasDb ? dbOrMissionId : getDb();
  const missionId = hasDb ? maybeMissionId : dbOrMissionId;
  const limit = hasDb ? maybeLimit : maybeMissionId || 20;
  return db
    .prepare(
      'SELECT * FROM mission_messages WHERE mission_id = ? ORDER BY created_at DESC, rowid DESC LIMIT ?'
    )
    .all(missionId, limit);
}

function listPendingMessageDeliveriesForMission(dbOrMissionId, maybeMissionId, maybeLimit = 20) {
  const hasDb = dbOrMissionId && typeof dbOrMissionId.prepare === 'function';
  const db = hasDb ? dbOrMissionId : getDb();
  const missionId = hasDb ? maybeMissionId : dbOrMissionId;
  const limit = hasDb ? maybeLimit : maybeMissionId || 20;
  return db
    .prepare(
      `SELECT d.*
       FROM message_deliveries d
       JOIN mission_messages m ON m.message_id = d.message_id
       WHERE m.mission_id = ?
         AND d.status IN ('pending', 'retry_pending')
       ORDER BY CASE
         WHEN COALESCE(d.updated_at, '') >= COALESCE(d.last_attempt_at, '') THEN d.updated_at
         ELSE d.last_attempt_at
       END DESC,
       d.rowid DESC
       LIMIT ?`
    )
    .all(missionId, limit);
}

function listMessageDeliveriesForMission(dbOrMissionId, maybeMissionId) {
  const hasDb = dbOrMissionId && typeof dbOrMissionId.prepare === 'function';
  const db = hasDb ? dbOrMissionId : getDb();
  const missionId = hasDb ? maybeMissionId : dbOrMissionId;
  return db
    .prepare(
      `SELECT d.*
       FROM message_deliveries d
       JOIN mission_messages m ON m.message_id = d.message_id
       WHERE m.mission_id = ?
       ORDER BY d.updated_at DESC, d.rowid DESC`
    )
    .all(missionId);
}

function listAgentPresenceForMission(dbOrMissionId, maybeMissionId) {
  const hasDb = dbOrMissionId && typeof dbOrMissionId.prepare === 'function';
  const db = hasDb ? dbOrMissionId : getDb();
  const missionId = hasDb ? maybeMissionId : dbOrMissionId;
  return db
    .prepare(
      'SELECT * FROM agent_presence WHERE mission_id = ? ORDER BY updated_at DESC, rowid DESC'
    )
    .all(missionId);
}

function pickSnapshotFields(row, allowedFields) {
  return allowedFields.reduce((acc, fieldName) => {
    acc[fieldName] = row?.[fieldName] ?? null;
    return acc;
  }, {});
}

function buildDirectorSnapshotWatermark({
  mission,
  participants,
  recentMessages,
  pendingDeliveries,
  presenceRows,
}) {
  const material = {
    mission: pickSnapshotFields(mission, DIRECTOR_SNAPSHOT_MISSION_FIELDS),
    participants: participants.map((row) =>
      pickSnapshotFields(row, DIRECTOR_SNAPSHOT_PARTICIPANT_FIELDS)
    ),
    recent_messages: recentMessages.map((row) =>
      pickSnapshotFields(row, DIRECTOR_SNAPSHOT_MESSAGE_FIELDS)
    ),
    pending_deliveries: pendingDeliveries.map((row) =>
      pickSnapshotFields(row, DIRECTOR_SNAPSHOT_DELIVERY_FIELDS)
    ),
    presence: [...presenceRows]
      .sort((left, right) => {
        const leftKey = `${left.presence_id || ''}|${left.agent_id || ''}|${left.runtime_surface || ''}`;
        const rightKey = `${right.presence_id || ''}|${right.agent_id || ''}|${right.runtime_surface || ''}`;
        return leftKey.localeCompare(rightKey);
      })
      .map((row) => pickSnapshotFields(row, DIRECTOR_SNAPSHOT_PRESENCE_FIELDS)),
  };

  return crypto.createHash('sha1').update(JSON.stringify(material)).digest('hex');
}

function createSwarmMission(dbOrInput, maybeInput) {
  const { db, input } = resolveDbArgs(dbOrInput, maybeInput);
  if (!input.project_id) throw new Error('project_id es requerido para swarm_missions.');
  if (!input.owner_agent_id) throw new Error('owner_agent_id es requerido para swarm_missions.');
  if (!input.title) throw new Error('title es requerido para swarm_missions.');
  if (!isSwarmMissionKind(input.kind))
    throw new Error(`kind inválido para swarm_missions: ${input.kind}`);
  const status = input.status || 'planned';
  if (!isSwarmMissionStatus(status)) {
    throw new Error(`status inválido para swarm_missions: ${status}`);
  }
  assertNoRuntimeOnlyFields(input, 'swarm_missions');

  const timestamp = input.updated_at || input.started_at || new Date().toISOString();
  const row = {
    mission_id: input.mission_id || crypto.randomUUID(),
    project_id: input.project_id,
    task_id: input.task_id || null,
    workspace_id: input.workspace_id || null,
    run_id: input.run_id || null,
    approval_checkpoint_key: input.approval_checkpoint_key || null,
    owner_agent_id: input.owner_agent_id,
    kind: input.kind,
    status,
    title: String(input.title).trim(),
    summary: input.summary ?? null,
    evidence_ref: input.evidence_ref || null,
    started_at: input.started_at || timestamp,
    updated_at: timestamp,
    completed_at: input.completed_at || null,
    created_at: input.created_at || timestamp,
  };
  const keys = Object.keys(row);
  db.prepare(
    `INSERT INTO swarm_missions (${keys.join(', ')}) VALUES (${keys.map(() => '?').join(', ')})`
  ).run(...keys.map((key) => row[key] ?? null));
  return getSwarmMissionById(db, row.mission_id);
}

function registerMissionParticipant(dbOrInput, maybeInput) {
  const { db, input } = resolveDbArgs(dbOrInput, maybeInput);
  if (!input.mission_id) throw new Error('mission_id es requerido para mission_participants.');
  if (!input.agent_id) throw new Error('agent_id es requerido para mission_participants.');
  if (!isMissionParticipantRole(input.role_in_mission)) {
    throw new Error(`role_in_mission inválido: ${input.role_in_mission}`);
  }
  const status = input.status || 'active';
  if (!isMissionParticipantStatus(status)) {
    throw new Error(`status inválido para mission_participants: ${status}`);
  }
  assertNoCanonicalIdentityMetadata(input);
  assertNoRuntimeOnlyFields(input, 'mission_participants');

  const timestamp = input.updated_at || input.joined_at || new Date().toISOString();
  const row = {
    participant_id: input.participant_id || crypto.randomUUID(),
    mission_id: input.mission_id,
    agent_id: input.agent_id,
    role_in_mission: input.role_in_mission,
    status,
    joined_at: input.joined_at || timestamp,
    left_at: input.left_at || null,
    created_at: input.created_at || timestamp,
    updated_at: timestamp,
  };
  const keys = Object.keys(row);
  db.prepare(
    `INSERT INTO mission_participants (${keys.join(', ')}) VALUES (${keys.map(() => '?').join(', ')})`
  ).run(...keys.map((key) => row[key] ?? null));
  return (
    db
      .prepare('SELECT * FROM mission_participants WHERE participant_id = ? LIMIT 1')
      .get(row.participant_id) || null
  );
}

function createMissionMessage(dbOrInput, maybeInput) {
  const { db, input } = resolveDbArgs(dbOrInput, maybeInput);
  if (!input.mission_id) throw new Error('mission_id es requerido para mission_messages.');
  if (!isMissionMessageKind(input.message_kind)) {
    throw new Error(`message_kind inválido para mission_messages: ${input.message_kind}`);
  }
  if (!input.body_summary || !String(input.body_summary).trim()) {
    throw new Error('body_summary es requerido para mission_messages.');
  }
  assertNoRuntimeOnlyFields(input, 'mission_messages');

  const timestamp = input.updated_at || input.created_at || new Date().toISOString();
  const row = {
    message_id: input.message_id || crypto.randomUUID(),
    mission_id: input.mission_id,
    sender_agent_id: input.sender_agent_id || null,
    message_kind: input.message_kind,
    body_summary: String(input.body_summary).trim(),
    evidence_ref: input.evidence_ref || null,
    related_task_id: input.related_task_id || null,
    related_workspace_id: input.related_workspace_id || null,
    related_run_id: input.related_run_id || null,
    related_artifact_id: input.related_artifact_id || null,
    related_approval_checkpoint_key: input.related_approval_checkpoint_key || null,
    created_at: input.created_at || timestamp,
    updated_at: timestamp,
  };
  const keys = Object.keys(row);
  db.prepare(
    `INSERT INTO mission_messages (${keys.join(', ')}) VALUES (${keys.map(() => '?').join(', ')})`
  ).run(...keys.map((key) => row[key] ?? null));
  return db
    .prepare('SELECT * FROM mission_messages WHERE message_id = ? LIMIT 1')
    .get(row.message_id);
}

function upsertMessageDelivery(dbOrInput, maybeInput) {
  const { db, input } = resolveDbArgs(dbOrInput, maybeInput);
  if (!input.message_id) throw new Error('message_id es requerido para message_deliveries.');
  if (!input.recipient_agent_id) {
    throw new Error('recipient_agent_id es requerido para message_deliveries.');
  }
  if (!input.channel) throw new Error('channel es requerido para message_deliveries.');
  if (!isMissionDeliveryStatus(input.status)) {
    throw new Error(`status inválido para message_deliveries: ${input.status}`);
  }
  assertNoRuntimeOnlyFields(input, 'message_deliveries');
  // Advanced runtime states are deferred to SW-8.2B / SW-8.2C.

  const deliveryId =
    input.delivery_id ||
    buildMissionDeliveryKey({
      message_id: input.message_id,
      recipient_agent_id: input.recipient_agent_id,
      channel: input.channel,
    });
  const existing =
    db.prepare('SELECT * FROM message_deliveries WHERE delivery_id = ? LIMIT 1').get(deliveryId) ||
    null;
  const timestamp = input.updated_at || input.last_attempt_at || new Date().toISOString();
  const row = {
    delivery_id: deliveryId,
    message_id: input.message_id,
    recipient_agent_id: input.recipient_agent_id,
    channel: input.channel,
    status: input.status,
    delivery_ref: input.delivery_ref ?? existing?.delivery_ref ?? null,
    evidence_ref: input.evidence_ref ?? existing?.evidence_ref ?? null,
    last_error: input.last_error ?? existing?.last_error ?? null,
    attempt_count: Number(input.attempt_count || existing?.attempt_count || 1),
    last_attempt_at: input.last_attempt_at || timestamp,
    acked_at: input.acked_at ?? existing?.acked_at ?? null,
    created_at: existing?.created_at || input.created_at || timestamp,
    updated_at: timestamp,
  };
  const keys = Object.keys(row);
  db.prepare(
    `INSERT INTO message_deliveries (${keys.join(', ')}) VALUES (${keys.map(() => '?').join(', ')})
     ON CONFLICT(delivery_id) DO UPDATE SET ${keys
       .filter((key) => key !== 'delivery_id' && key !== 'created_at')
       .map((key) => `${key} = excluded.${key}`)
       .join(', ')}`
  ).run(...keys.map((key) => row[key] ?? null));
  return db
    .prepare('SELECT * FROM message_deliveries WHERE delivery_id = ? LIMIT 1')
    .get(deliveryId);
}

function upsertAgentPresence(dbOrInput, maybeInput) {
  const { db, input } = resolveDbArgs(dbOrInput, maybeInput);
  if (!input.agent_id) throw new Error('agent_id es requerido para agent_presence.');
  if (!input.runtime_surface) throw new Error('runtime_surface es requerido para agent_presence.');
  if (!isAgentPresenceState(input.presence_state)) {
    throw new Error(`presence_state inválido para agent_presence: ${input.presence_state}`);
  }
  assertNoRuntimeOnlyFields(input, 'agent_presence');

  const lastSeenAt = input.last_seen_at || new Date().toISOString();
  const presenceId =
    input.presence_id ||
    buildAgentPresenceKey({
      mission_id: input.mission_id || null,
      agent_id: input.agent_id,
      runtime_surface: input.runtime_surface,
    });
  const existing =
    db.prepare('SELECT * FROM agent_presence WHERE presence_id = ? LIMIT 1').get(presenceId) ||
    null;
  const timestamp = input.updated_at || lastSeenAt;
  const row = {
    presence_id: presenceId,
    mission_id: input.mission_id ?? existing?.mission_id ?? null,
    agent_id: input.agent_id,
    workspace_id: input.workspace_id ?? existing?.workspace_id ?? null,
    run_id: input.run_id ?? existing?.run_id ?? null,
    runtime_surface: input.runtime_surface,
    presence_state: input.presence_state,
    status_summary: input.status_summary ?? existing?.status_summary ?? null,
    evidence_ref: input.evidence_ref ?? existing?.evidence_ref ?? null,
    last_seen_at: lastSeenAt,
    expires_at: input.expires_at || addPresenceTtl(lastSeenAt),
    created_at: existing?.created_at || input.created_at || timestamp,
    updated_at: timestamp,
  };
  const keys = Object.keys(row);
  db.prepare(
    `INSERT INTO agent_presence (${keys.join(', ')}) VALUES (${keys.map(() => '?').join(', ')})
     ON CONFLICT(presence_id) DO UPDATE SET ${keys
       .filter((key) => key !== 'presence_id' && key !== 'created_at')
       .map((key) => `${key} = excluded.${key}`)
       .join(', ')}`
  ).run(...keys.map((key) => row[key] ?? null));
  return db.prepare('SELECT * FROM agent_presence WHERE presence_id = ? LIMIT 1').get(presenceId);
}

function getSwarmMissionDirectorSnapshot(dbOrMissionId, maybeMissionId, maybeOptions) {
  const hasDb = dbOrMissionId && typeof dbOrMissionId.prepare === 'function';
  const db = hasDb ? dbOrMissionId : getDb();
  const missionId = hasDb ? maybeMissionId : dbOrMissionId;
  const options = hasDb ? maybeOptions || {} : maybeMissionId || {};
  const snapshotAt = options.now || new Date().toISOString();
  const mission = getSwarmMissionById(db, missionId);
  if (!mission) return null;

  const participants = listMissionParticipants(db, missionId);
  const recentMessages = listRecentMissionMessages(db, missionId, 20);
  const latestMessage = recentMessages[0] || null;
  const pendingDeliveries = listPendingMessageDeliveriesForMission(db, missionId, 20);
  const supervisorSnapshots = mission.task_id
    ? listSupervisorSnapshots(db, { task_id: mission.task_id, limit: 20 })
    : [];
  const approvalCheckpoints = mission.task_id
    ? listSupervisorApprovalCheckpoints(db, { task_id: mission.task_id, limit: 20 })
    : [];
  const presenceRows = listAgentPresenceForMission(db, missionId).map((presence) => ({
    ...presence,
    ...getAgentPresenceStatus(presence, { ...options, now: snapshotAt }),
  }));
  const watermark = buildDirectorSnapshotWatermark({
    mission,
    participants,
    recentMessages,
    pendingDeliveries,
    presenceRows,
  });

  return {
    mission,
    participants,
    recent_messages: recentMessages,
    latest_message: latestMessage,
    pending_deliveries: pendingDeliveries,
    supervisor_snapshots: supervisorSnapshots,
    approval_checkpoints: approvalCheckpoints,
    snapshot_at: snapshotAt,
    watermark,
    presence: {
      active: presenceRows.filter(
        (presence) => !presence.stale && presence.effective_state !== 'offline'
      ),
      stale: presenceRows.filter((presence) => presence.effective_state === 'stale'),
      offline: presenceRows.filter((presence) => presence.effective_state === 'offline'),
    },
  };
}

function buildTelegramActorId(telegramUserId) {
  return `telegram:${String(telegramUserId).trim()}`;
}

function buildTelegramIntentIdempotencyKey({
  update_id,
  message_id,
  actor_id,
  action,
  target_ref = {},
}) {
  const anchor = update_id || message_id || '-';
  return [
    'telegram',
    anchor,
    actor_id || '-',
    action || '-',
    target_ref.task_id || '-',
    target_ref.workspace_id || '-',
    target_ref.run_id || '-',
    target_ref.approval_id || '-',
  ].join(':');
}

function getTelegramActorMappingByTelegramUser(dbOrUserId, maybeUserId) {
  const hasDb = dbOrUserId && typeof dbOrUserId.prepare === 'function';
  const db = hasDb ? dbOrUserId : getDb();
  const telegramUserId = hasDb ? maybeUserId : dbOrUserId;
  if (!telegramUserId) return null;
  return normalizeTelegramActorRow(
    db
      .prepare('SELECT * FROM telegram_actor_mappings WHERE telegram_user_id = ? LIMIT 1')
      .get(String(telegramUserId)) || null
  );
}

function getTelegramActorMappingByActorId(dbOrActorId, maybeActorId) {
  const hasDb = dbOrActorId && typeof dbOrActorId.prepare === 'function';
  const db = hasDb ? dbOrActorId : getDb();
  const actorId = hasDb ? maybeActorId : dbOrActorId;
  if (!actorId) return null;
  return normalizeTelegramActorRow(
    db.prepare('SELECT * FROM telegram_actor_mappings WHERE actor_id = ? LIMIT 1').get(actorId) ||
      null
  );
}

function upsertTelegramActorMapping(dbOrInput, maybeInput) {
  const { db, input } = resolveDbArgs(dbOrInput, maybeInput);
  if (!input.telegram_user_id) throw new Error('telegram_user_id es requerido para actor mapping.');
  if (!input.devhub_actor_id) throw new Error('devhub_actor_id es requerido para actor mapping.');

  const existing = getTelegramActorMappingByTelegramUser(db, input.telegram_user_id);
  const timestamp = input.updated_at || new Date().toISOString();
  const row = {
    actor_id: input.actor_id || existing?.actor_id || buildTelegramActorId(input.telegram_user_id),
    telegram_user_id: String(input.telegram_user_id),
    telegram_chat_id: input.telegram_chat_id
      ? String(input.telegram_chat_id)
      : existing?.telegram_chat_id || null,
    devhub_actor_id: input.devhub_actor_id,
    display_name: input.display_name ?? existing?.display_name ?? null,
    allowlisted: input.allowlisted ? 1 : 0,
    metadata:
      input.metadata !== undefined
        ? JSON.stringify(input.metadata)
        : existing?.metadata
          ? JSON.stringify(existing.metadata)
          : null,
    created_at: existing?.created_at || input.created_at || timestamp,
    updated_at: timestamp,
  };
  const keys = Object.keys(row);
  db.prepare(
    `INSERT INTO telegram_actor_mappings (${keys.join(', ')}) VALUES (${keys.map(() => '?').join(', ')})
     ON CONFLICT(telegram_user_id) DO UPDATE SET ${keys
       .filter((key) => key !== 'created_at' && key !== 'telegram_user_id')
       .map((key) => `${key} = excluded.${key}`)
       .join(', ')}`
  ).run(...keys.map((key) => row[key] ?? null));
  return getTelegramActorMappingByTelegramUser(db, input.telegram_user_id);
}

function getTelegramIntentByIdempotencyKey(dbOrKey, maybeKey) {
  const hasDb = dbOrKey && typeof dbOrKey.prepare === 'function';
  const db = hasDb ? dbOrKey : getDb();
  const key = hasDb ? maybeKey : dbOrKey;
  if (!key) return null;
  return normalizeTelegramIntentRow(
    db
      .prepare('SELECT * FROM telegram_intent_envelopes WHERE idempotency_key = ? LIMIT 1')
      .get(key) || null
  );
}

function recordTelegramIntentEnvelope(dbOrInput, maybeInput) {
  const { db, input } = resolveDbArgs(dbOrInput, maybeInput);
  if (!input.actor_id) throw new Error('actor_id es requerido para telegram intents.');
  if (!input.chat_id) throw new Error('chat_id es requerido para telegram intents.');
  if (!input.action || !isTelegramIntentAction(input.action)) {
    throw new Error(`action inválida para telegram intents: ${input.action}`);
  }

  const actor = getTelegramActorMappingByActorId(db, input.actor_id);
  if (!actor) throw new Error(`actor_id no encontrado para telegram intents: ${input.actor_id}`);
  if (!actor.allowlisted)
    throw new Error(`actor_id no allowlisted para telegram intents: ${input.actor_id}`);

  const targetRef = input.target_ref || {};
  const idempotencyKey =
    input.idempotency_key ||
    buildTelegramIntentIdempotencyKey({
      update_id: input.update_id || null,
      message_id: input.message_id || null,
      actor_id: input.actor_id,
      action: input.action,
      target_ref: targetRef,
    });
  const existing = getTelegramIntentByIdempotencyKey(db, idempotencyKey);
  if (existing) {
    return {
      ...existing,
      replayed: true,
    };
  }

  const timestamp = input.updated_at || new Date().toISOString();
  const status = input.status || 'accepted';
  if (!isTelegramIntentStatus(status)) {
    throw new Error(`status inválido para telegram intents: ${status}`);
  }

  const row = {
    intent_id: input.intent_id || crypto.randomUUID(),
    idempotency_key: idempotencyKey,
    actor_id: input.actor_id,
    telegram_chat_id: String(input.chat_id),
    message_id: input.message_id ? String(input.message_id) : null,
    update_id: input.update_id ? String(input.update_id) : null,
    action: input.action,
    task_id: targetRef.task_id || null,
    workspace_id: targetRef.workspace_id || null,
    run_id: targetRef.run_id || null,
    approval_id: targetRef.approval_id || null,
    payload: input.payload !== undefined ? JSON.stringify(input.payload) : null,
    status,
    audit_status: input.audit_status || status,
    result_ref: input.result_ref || null,
    created_at: input.created_at || timestamp,
    updated_at: timestamp,
  };
  const keys = Object.keys(row);
  db.prepare(
    `INSERT INTO telegram_intent_envelopes (${keys.join(', ')}) VALUES (${keys.map(() => '?').join(', ')})`
  ).run(...keys.map((key) => row[key] ?? null));
  return {
    ...getTelegramIntentByIdempotencyKey(db, idempotencyKey),
    replayed: false,
  };
}

function buildTelegramDeliveryKey({
  intent_id = null,
  task_id = null,
  workspace_id = null,
  run_id = null,
  telegram_chat_id,
}) {
  return [
    'delivery',
    intent_id || '-',
    task_id || '-',
    workspace_id || '-',
    run_id || '-',
    telegram_chat_id || '-',
  ].join(':');
}

function getLatestTelegramDeliveryReceipt(
  db,
  { task_id = null, workspace_id = null, run_id = null } = {}
) {
  const clauses = [];
  const params = [];
  if (run_id) {
    clauses.push('run_id = ?');
    params.push(run_id);
  } else if (workspace_id) {
    clauses.push('workspace_id = ?');
    params.push(workspace_id);
  } else if (task_id) {
    clauses.push('task_id = ?');
    params.push(task_id);
  }
  const whereSql = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
  return normalizeTelegramDeliveryRow(
    db
      .prepare(
        `SELECT * FROM telegram_delivery_receipts ${whereSql} ORDER BY updated_at DESC, rowid DESC LIMIT 1`
      )
      .get(...params) || null
  );
}

function upsertTelegramDeliveryReceipt(dbOrInput, maybeInput) {
  const { db, input } = resolveDbArgs(dbOrInput, maybeInput);
  if (!input.telegram_chat_id) {
    throw new Error('telegram_chat_id es requerido para delivery receipts.');
  }
  if (!input.status || !isTelegramDeliveryStatus(input.status)) {
    throw new Error(`status inválido para delivery receipts: ${input.status}`);
  }

  const deliveryKey =
    input.delivery_key ||
    buildTelegramDeliveryKey({
      intent_id: input.intent_id || null,
      task_id: input.task_id || null,
      workspace_id: input.workspace_id || null,
      run_id: input.run_id || null,
      telegram_chat_id: input.telegram_chat_id,
    });
  const existing = normalizeTelegramDeliveryRow(
    db
      .prepare('SELECT * FROM telegram_delivery_receipts WHERE delivery_key = ? LIMIT 1')
      .get(deliveryKey) || null
  );
  const timestamp = input.updated_at || input.last_attempt_at || new Date().toISOString();
  const row = {
    delivery_key: deliveryKey,
    task_id: input.task_id || existing?.task_id || null,
    workspace_id: input.workspace_id || existing?.workspace_id || null,
    run_id: input.run_id || existing?.run_id || null,
    intent_id: input.intent_id || existing?.intent_id || null,
    telegram_chat_id: String(input.telegram_chat_id),
    status: input.status,
    attempts_count: Number(input.attempts_count || existing?.attempts_count || 1),
    last_error: input.last_error ?? existing?.last_error ?? null,
    last_attempt_at: input.last_attempt_at || timestamp,
    created_at: existing?.created_at || input.created_at || timestamp,
    updated_at: timestamp,
  };
  const keys = Object.keys(row);
  db.prepare(
    `INSERT INTO telegram_delivery_receipts (${keys.join(', ')}) VALUES (${keys.map(() => '?').join(', ')})
     ON CONFLICT(delivery_key) DO UPDATE SET ${keys
       .filter((key) => key !== 'delivery_key' && key !== 'created_at')
       .map((key) => `${key} = excluded.${key}`)
       .join(', ')}`
  ).run(...keys.map((key) => row[key] ?? null));
  return getLatestTelegramDeliveryReceipt(db, {
    task_id: row.task_id,
    workspace_id: row.workspace_id,
    run_id: row.run_id,
  });
}

function buildTelegramSubscriptionKey({
  actor_id = null,
  telegram_chat_id,
  task_id = null,
  workspace_id = null,
  run_id = null,
}) {
  return [
    'subscription',
    actor_id || '-',
    telegram_chat_id || '-',
    task_id || '-',
    workspace_id || '-',
    run_id || '-',
  ].join(':');
}

function upsertTelegramSubscription(dbOrInput, maybeInput) {
  const { db, input } = resolveDbArgs(dbOrInput, maybeInput);
  if (!input.telegram_chat_id) {
    throw new Error('telegram_chat_id es requerido para subscriptions.');
  }
  if (!input.status || !isTelegramSubscriptionStatus(input.status)) {
    throw new Error(`status inválido para subscriptions: ${input.status}`);
  }

  const subscriptionKey =
    input.subscription_key ||
    buildTelegramSubscriptionKey({
      actor_id: input.actor_id || null,
      telegram_chat_id: String(input.telegram_chat_id),
      task_id: input.task_id || null,
      workspace_id: input.workspace_id || null,
      run_id: input.run_id || null,
    });
  const existing = normalizeTelegramSubscriptionRow(
    db
      .prepare('SELECT * FROM telegram_subscriptions WHERE subscription_key = ? LIMIT 1')
      .get(subscriptionKey) || null
  );
  const timestamp = input.updated_at || new Date().toISOString();
  const row = {
    subscription_key: subscriptionKey,
    actor_id: input.actor_id || existing?.actor_id || null,
    telegram_chat_id: String(input.telegram_chat_id),
    task_id: input.task_id || existing?.task_id || null,
    workspace_id: input.workspace_id || existing?.workspace_id || null,
    run_id: input.run_id || existing?.run_id || null,
    status: input.status,
    created_at: existing?.created_at || input.created_at || timestamp,
    updated_at: timestamp,
  };
  const keys = Object.keys(row);
  db.prepare(
    `INSERT INTO telegram_subscriptions (${keys.join(', ')}) VALUES (${keys.map(() => '?').join(', ')})
     ON CONFLICT(subscription_key) DO UPDATE SET ${keys
       .filter((key) => key !== 'subscription_key' && key !== 'created_at')
       .map((key) => `${key} = excluded.${key}`)
       .join(', ')}`
  ).run(...keys.map((key) => row[key] ?? null));

  return normalizeTelegramSubscriptionRow(
    db
      .prepare('SELECT * FROM telegram_subscriptions WHERE subscription_key = ? LIMIT 1')
      .get(subscriptionKey) || null
  );
}

function getLatestTelegramChannelSnapshot(dbOrFilters, maybeFilters) {
  const { db, input } = resolveDbArgs(dbOrFilters, maybeFilters);
  const filters = input || {};

  const snapshot = filters.task_id
    ? getSupervisorSnapshot(db, filters.task_id)
    : db
        .prepare('SELECT * FROM supervisor_snapshots ORDER BY updated_at DESC, rowid DESC LIMIT 1')
        .get();
  const workspace = snapshot?.workspace_id
    ? db.prepare('SELECT * FROM agent_workspaces WHERE id = ? LIMIT 1').get(snapshot.workspace_id)
    : db
        .prepare(
          'SELECT * FROM agent_workspaces WHERE status IS NOT NULL OR evidence_ref IS NOT NULL ORDER BY updated_at DESC, rowid DESC LIMIT 1'
        )
        .get();
  const run = snapshot?.run_id
    ? getAgentRunById(db, snapshot.run_id)
    : workspace?.id
      ? getLatestAgentRunForWorkspace(db, workspace.id)
      : db.prepare('SELECT * FROM agent_runs ORDER BY created_at DESC, rowid DESC LIMIT 1').get();

  if (!snapshot && !workspace && !run) return null;

  const latestArtifact = run?.run_id ? getLatestAgentArtifactForRun(db, run.run_id) : null;
  const artifactCount = run?.run_id
    ? Number(
        db.prepare('SELECT count(*) as cnt FROM agent_artifacts WHERE run_id = ?').get(run.run_id)
          ?.cnt || 0
      )
    : 0;
  const approval = snapshot?.approval_checkpoint_key
    ? getSupervisorApprovalCheckpoint(db, snapshot.approval_checkpoint_key)
    : snapshot?.task_id
      ? listSupervisorApprovalCheckpoints(db, { task_id: snapshot.task_id, limit: 1 })[0] || null
      : null;
  const delivery = getLatestTelegramDeliveryReceipt(db, {
    task_id: snapshot?.task_id || workspace?.current_task_id || run?.task_id || null,
    workspace_id: snapshot?.workspace_id || workspace?.id || null,
    run_id: snapshot?.run_id || run?.run_id || null,
  });

  return {
    task_id: snapshot?.task_id || workspace?.current_task_id || run?.task_id || null,
    supervisor_state: snapshot?.supervisor_state || null,
    outcome: snapshot?.outcome || null,
    reason_class: snapshot?.reason_class || null,
    workspace_id: snapshot?.workspace_id || workspace?.id || run?.workspace_id || null,
    run_id: snapshot?.run_id || run?.run_id || null,
    evidence_ref:
      snapshot?.evidence_ref || latestArtifact?.evidence_ref || workspace?.evidence_ref || null,
    workspace_status: workspace?.status || null,
    run_status: run?.status || null,
    terminal_reason_class: run?.terminal_reason_class || null,
    latest_artifact_kind: latestArtifact?.kind || null,
    latest_artifact_evidence_ref: latestArtifact?.evidence_ref || null,
    artifact_count: artifactCount,
    approval: approval
      ? {
          id: approval.checkpoint_key,
          status: approval.status,
          expires_at: approval.expires_at || null,
        }
      : null,
    delivery: delivery
      ? {
          last_status: delivery.status,
          attempts_count: delivery.attempts_count,
          last_error: delivery.last_error || null,
          last_attempt_at: delivery.last_attempt_at || null,
        }
      : null,
    degraded: false,
  };
}

function buildSupervisorApprovalCheckpointKey({
  task_id,
  workspace_id = null,
  run_id = null,
  reason_class,
  evidence_ref = null,
}) {
  if (!task_id) throw new Error('task_id es requerido para approval checkpoint.');
  if (!reason_class) throw new Error('reason_class es requerido para approval checkpoint.');
  return [task_id, workspace_id || '-', run_id || '-', reason_class, evidence_ref || '-'].join('|');
}

function getSupervisorSnapshot(dbOrTaskId, maybeTaskId) {
  const hasDb = dbOrTaskId && typeof dbOrTaskId.prepare === 'function';
  const db = hasDb ? dbOrTaskId : getDb();
  const taskId = hasDb ? maybeTaskId : dbOrTaskId;
  if (!taskId) return null;
  return (
    db.prepare('SELECT * FROM supervisor_snapshots WHERE task_id = ? LIMIT 1').get(taskId) || null
  );
}

function getLatestTaskComment(dbOrTaskId, maybeTaskId) {
  const hasDb = dbOrTaskId && typeof dbOrTaskId.prepare === 'function';
  const db = hasDb ? dbOrTaskId : getDb();
  const taskId = hasDb ? maybeTaskId : dbOrTaskId;
  if (!taskId) return null;
  return (
    db
      .prepare(
        'SELECT * FROM task_comments WHERE task_id = ? ORDER BY created_at DESC, rowid DESC LIMIT 1'
      )
      .get(taskId) || null
  );
}

function listSupervisorSnapshots(dbOrFilters, maybeFilters) {
  const { db, input } = resolveDbArgs(dbOrFilters, maybeFilters);
  const filters = input || {};
  const clauses = [];
  const params = [];

  if (filters.task_id) {
    clauses.push('task_id = ?');
    params.push(filters.task_id);
  }
  if (filters.workspace_id) {
    clauses.push('workspace_id = ?');
    params.push(filters.workspace_id);
  }
  if (filters.run_id) {
    clauses.push('run_id = ?');
    params.push(filters.run_id);
  }
  if (filters.supervisor_state) {
    clauses.push('supervisor_state = ?');
    params.push(filters.supervisor_state);
  }

  const whereSql = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
  const limitSql = Number.isInteger(filters.limit) ? ' LIMIT ?' : '';
  const statement = db.prepare(
    `SELECT * FROM supervisor_snapshots ${whereSql} ORDER BY updated_at DESC, rowid DESC${limitSql}`
  );
  if (Number.isInteger(filters.limit)) params.push(filters.limit);
  return statement.all(...params);
}

function upsertSupervisorSnapshot(dbOrInput, maybeInput) {
  const { db, input } = resolveDbArgs(dbOrInput, maybeInput);
  if (!input.task_id) throw new Error('task_id es requerido para supervisor_snapshots.');
  if (!isSupervisorState(input.supervisor_state)) {
    throw new Error(`supervisor_state inválido: ${input.supervisor_state}`);
  }
  if (!isSupervisorOutcome(input.outcome)) {
    throw new Error(`outcome inválido: ${input.outcome}`);
  }
  if (!isSupervisorReasonClass(input.reason_class)) {
    throw new Error(`reason_class inválido: ${input.reason_class}`);
  }

  const existing = getSupervisorSnapshot(db, input.task_id);
  const timestamp = input.updated_at || new Date().toISOString();
  const row = {
    task_id: input.task_id,
    supervisor_state: input.supervisor_state,
    outcome: input.outcome || null,
    reason_class: input.reason_class || null,
    task_retry_count: Number(input.task_retry_count || 0),
    attempt_count: Number(input.attempt_count || 0),
    unchanged_failure_count: Number(input.unchanged_failure_count || 0),
    approval_request_count: Number(input.approval_request_count || 0),
    orphan_recovery_count: Number(input.orphan_recovery_count || 0),
    workspace_id: input.workspace_id || null,
    run_id: input.run_id || null,
    evidence_ref: input.evidence_ref || null,
    approval_checkpoint_key: input.approval_checkpoint_key || null,
    created_at: existing?.created_at || input.created_at || timestamp,
    updated_at: timestamp,
  };

  const keys = Object.keys(row);
  db.prepare(
    `INSERT INTO supervisor_snapshots (${keys.join(', ')}) VALUES (${keys.map(() => '?').join(', ')})
     ON CONFLICT(task_id) DO UPDATE SET ${keys
       .filter((key) => key !== 'task_id' && key !== 'created_at')
       .map((key) => `${key} = excluded.${key}`)
       .join(', ')}`
  ).run(...keys.map((key) => row[key] ?? null));

  return getSupervisorSnapshot(db, input.task_id);
}

function getSupervisorApprovalCheckpoint(dbOrKey, maybeKey) {
  const hasDb = dbOrKey && typeof dbOrKey.prepare === 'function';
  const db = hasDb ? dbOrKey : getDb();
  const checkpointKey = hasDb ? maybeKey : dbOrKey;
  if (!checkpointKey) return null;
  return (
    db
      .prepare('SELECT * FROM supervisor_approval_checkpoints WHERE checkpoint_key = ? LIMIT 1')
      .get(checkpointKey) || null
  );
}

function listSupervisorApprovalCheckpoints(dbOrFilters, maybeFilters) {
  const { db, input } = resolveDbArgs(dbOrFilters, maybeFilters);
  const filters = input || {};
  const clauses = [];
  const params = [];

  if (filters.task_id) {
    clauses.push('task_id = ?');
    params.push(filters.task_id);
  }
  if (filters.workspace_id) {
    clauses.push('workspace_id = ?');
    params.push(filters.workspace_id);
  }
  if (filters.run_id) {
    clauses.push('run_id = ?');
    params.push(filters.run_id);
  }
  if (filters.status) {
    clauses.push('status = ?');
    params.push(filters.status);
  }

  const whereSql = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
  const limitSql = Number.isInteger(filters.limit) ? ' LIMIT ?' : '';
  const statement = db.prepare(
    `SELECT * FROM supervisor_approval_checkpoints ${whereSql} ORDER BY updated_at DESC, rowid DESC${limitSql}`
  );
  if (Number.isInteger(filters.limit)) params.push(filters.limit);
  return statement.all(...params);
}

function upsertSupervisorApprovalCheckpoint(dbOrInput, maybeInput) {
  const { db, input } = resolveDbArgs(dbOrInput, maybeInput);
  if (!input.task_id) throw new Error('task_id es requerido para supervisor_approval_checkpoints.');
  if (!isSupervisorReasonClass(input.reason_class) || !input.reason_class) {
    throw new Error(`reason_class inválido: ${input.reason_class}`);
  }
  const status = input.status || 'pending';
  if (!isSupervisorApprovalStatus(status)) {
    throw new Error(`approval status inválido: ${status}`);
  }

  const checkpointKey =
    input.checkpoint_key ||
    buildSupervisorApprovalCheckpointKey({
      task_id: input.task_id,
      workspace_id: input.workspace_id || null,
      run_id: input.run_id || null,
      reason_class: input.reason_class,
      evidence_ref: input.evidence_ref || null,
    });
  const existing = getSupervisorApprovalCheckpoint(db, checkpointKey);
  const timestamp = input.updated_at || new Date().toISOString();
  const decidedAt =
    status === 'pending' ? null : (input.decided_at ?? existing?.decided_at ?? timestamp);
  const row = {
    checkpoint_key: checkpointKey,
    task_id: input.task_id,
    workspace_id: input.workspace_id || null,
    run_id: input.run_id || null,
    reason_class: input.reason_class,
    evidence_ref: input.evidence_ref || null,
    status,
    requested_at: existing?.requested_at || input.requested_at || timestamp,
    decided_at: decidedAt,
    decision_note: input.decision_note ?? existing?.decision_note ?? null,
    created_at: existing?.created_at || input.created_at || timestamp,
    updated_at: timestamp,
  };

  const keys = Object.keys(row);
  db.prepare(
    `INSERT INTO supervisor_approval_checkpoints (${keys.join(', ')}) VALUES (${keys.map(() => '?').join(', ')})
     ON CONFLICT(checkpoint_key) DO UPDATE SET ${keys
       .filter((key) => key !== 'checkpoint_key' && key !== 'created_at' && key !== 'requested_at')
       .map((key) => `${key} = excluded.${key}`)
       .join(', ')}`
  ).run(...keys.map((key) => row[key] ?? null));

  return getSupervisorApprovalCheckpoint(db, checkpointKey);
}

function deleteByProjectId(db, tableName, projectId) {
  if (!tableHasColumn(db, tableName, 'project_id')) return;
  db.prepare(`DELETE FROM ${tableName} WHERE project_id = ?`).run(projectId);
}

function deleteByValues(db, tableName, columnName, values) {
  if (!values || values.length === 0 || !tableHasColumn(db, tableName, columnName)) return;
  const placeholders = values.map(() => '?').join(', ');
  db.prepare(`DELETE FROM ${tableName} WHERE ${columnName} IN (${placeholders})`).run(...values);
}

function deleteProjectCascadeUnsafe(db, projectId) {
  if (!projectId) return { changes: 0 };

  const project = db.prepare('SELECT id FROM projects WHERE id = ?').get(projectId);
  if (!project) return { changes: 0 };

  const taskIds = tableHasColumn(db, 'tasks', 'project_id')
    ? db
        .prepare('SELECT id FROM tasks WHERE project_id = ?')
        .all(projectId)
        .map((row) => row.id)
    : [];

  deleteByValues(db, 'task_dependencies', 'task_id', taskIds);
  deleteByValues(db, 'task_dependencies', 'depends_on', taskIds);
  deleteByValues(db, 'task_comments', 'task_id', taskIds);

  deleteByProjectId(db, 'tasks', projectId);
  deleteByProjectId(db, 'milestones', projectId);
  deleteByProjectId(db, 'agent_registry', projectId);
  deleteByProjectId(db, 'ai_interactions', projectId);
  deleteByProjectId(db, 'project_files', projectId);
  deleteByProjectId(db, 'agent_memory', projectId);
  deleteByProjectId(db, 'telegram_session_map', projectId);
  deleteByProjectId(db, 'agent_hub_sessions', projectId);

  return db.prepare('DELETE FROM projects WHERE id = ?').run(projectId);
}

function makeTableOps(tableName, idCol = 'id') {
  return {
    select(options = {}) {
      const db = getDb();
      const { sql, params } = buildSelectQuery(tableName, options);
      return db.prepare(sql).all(...params);
    },
    single(options = {}) {
      const db = getDb();
      const { sql, params } = buildSelectQuery(tableName, { ...options, limit: 1 });
      return db.prepare(sql).get(...params);
    },
    insert(data) {
      const db = getDb();
      const cols = Object.keys(data);
      const vals = cols.map((k) => data[k] ?? null);
      const info = db
        .prepare(
          `INSERT INTO ${tableName} (${cols.join(', ')}) VALUES (${cols.map(() => '?').join(', ')})`
        )
        .run(...vals);
      // If data includes the PK use it; otherwise fall back to lastInsertRowid
      if (data[idCol] !== undefined && data[idCol] !== null) {
        return db.prepare(`SELECT * FROM ${tableName} WHERE ${idCol} = ?`).get(data[idCol]);
      }
      return db.prepare(`SELECT * FROM ${tableName} WHERE rowid = ?`).get(info.lastInsertRowid);
    },
    update(data, where) {
      const db = getDb();
      const keys = Object.keys(data);
      if (keys.length === 0) return null;
      const { clauses, values } = buildWhere(where);
      const setCols = keys.map((k) => `${k} = ?`);
      const setVals = keys.map((k) => data[k] ?? null);
      db.prepare(
        `UPDATE ${tableName} SET ${setCols.join(', ')} WHERE ${clauses.join(' AND ')}`
      ).run(...setVals, ...values);
      return db
        .prepare(`SELECT * FROM ${tableName} WHERE ${clauses.join(' AND ')} LIMIT 1`)
        .get(...values);
    },
    delete(where) {
      const db = getDb();
      const { clauses, values } = buildWhere(where);
      return db.prepare(`DELETE FROM ${tableName} WHERE ${clauses.join(' AND ')}`).run(...values);
    },
  };
}

const projectTableOps = makeTableOps('projects', 'id');

const tables = {
  projects: {
    ...projectTableOps,
    delete(where) {
      const db = getDb();
      const { clauses, values } = buildWhere(where);
      const projectIds = db
        .prepare(`SELECT id FROM projects WHERE ${clauses.join(' AND ')}`)
        .all(...values)
        .map((row) => row.id);

      if (projectIds.length === 0) return { changes: 0 };

      const deleteProjectsTxn = db.transaction((ids) => {
        let totalChanges = 0;
        for (const projectId of ids) {
          totalChanges += deleteProjectCascadeUnsafe(db, projectId).changes || 0;
        }
        return { changes: totalChanges };
      });

      return deleteProjectsTxn(projectIds);
    },
  },
  tasks: makeTableOps('tasks', 'id'),
  milestones: makeTableOps('milestones', 'id'),
  agent_workspaces: makeTableOps('agent_workspaces', 'id'),
  agent_runs: makeTableOps('agent_runs', 'run_id'),
  agent_artifacts: makeTableOps('agent_artifacts', 'artifact_id'),
  supervisor_snapshots: makeTableOps('supervisor_snapshots', 'task_id'),
  supervisor_approval_checkpoints: makeTableOps(
    'supervisor_approval_checkpoints',
    'checkpoint_key'
  ),
  swarm_missions: makeTableOps('swarm_missions', 'mission_id'),
  mission_participants: makeTableOps('mission_participants', 'participant_id'),
  mission_messages: makeTableOps('mission_messages', 'message_id'),
  message_deliveries: makeTableOps('message_deliveries', 'delivery_id'),
  agent_presence: makeTableOps('agent_presence', 'presence_id'),
  telegram_actor_mappings: makeTableOps('telegram_actor_mappings', 'actor_id'),
  telegram_intent_envelopes: makeTableOps('telegram_intent_envelopes', 'intent_id'),
  telegram_delivery_receipts: makeTableOps('telegram_delivery_receipts', 'delivery_key'),
  telegram_subscriptions: makeTableOps('telegram_subscriptions', 'subscription_key'),
  project_files: makeTableOps('project_files', 'id'),
  agent_registry: makeTableOps('agent_registry', 'agent_id'),
  mcp_connections: makeTableOps('mcp_connections', 'id'),
  ai_interactions: makeTableOps('ai_interactions', 'id'),
  agent_hub_sessions: makeTableOps('agent_hub_sessions', 'id'),
  agent_hub_messages: makeTableOps('agent_hub_messages', 'id'),
  swarm_config: makeTableOps('swarm_config', 'key'),
  swarm_processes: makeTableOps('swarm_processes', 'id'),
  profiles: {
    ...makeTableOps('profiles', 'id'),
    upsert(data) {
      const db = getDb();
      const cols = Object.keys(data);
      const vals = cols.map((k) => data[k] ?? null);
      const updateCols = cols
        .filter((k) => k !== 'id')
        .map((k) => `${k} = excluded.${k}`)
        .join(', ');
      db.prepare(
        `INSERT INTO profiles (${cols.join(', ')}) VALUES (${cols.map(() => '?').join(', ')}) ON CONFLICT(id) DO UPDATE SET ${updateCols}`
      ).run(...vals);
      return db.prepare('SELECT * FROM profiles WHERE id = ?').get(data.id);
    },
  },
  task_dependencies: makeTableOps('task_dependencies', 'id'),
};

class LocalQuery {
  constructor(table) {
    this.table = table;
    this._select = '*';
    this._where = [];
    this._orderBy = [];
    this._limitVal = null;
  }
  select(fields) {
    if (typeof fields === 'string') {
      this._select =
        fields === '*'
          ? '*'
          : fields
              .split(',')
              .map((f) => f.trim())
              .join(', ');
    }
    return this;
  }
  eq(col, val) {
    this._where.push([col, '=', val]);
    return this;
  }
  neq(col, val) {
    this._where.push([col, '!=', val]);
    return this;
  }
  in(col, vals) {
    if (!vals || vals.length === 0) {
      this._where.push(['1', '=', '0']);
      return this;
    }
    this._where.push([col, `IN (${vals.map(() => '?').join(', ')})`, vals]);
    return this;
  }
  order(col, { ascending = true } = {}) {
    this._orderBy.push([col, ascending ? 'ASC' : 'DESC']);
    return this;
  }
  limit(n) {
    this._limitVal = n;
    return this;
  }
  async then(resolve, reject) {
    try {
      const r = await this.execute();
      if (resolve) resolve(r);
      return r;
    } catch (e) {
      if (reject) reject(e);
      throw e;
    }
  }
  async execute() {
    const tableOps = tables[this.table];
    if (!tableOps) throw new Error(`Table ${this.table} not found`);
    return tableOps.select({
      select: this._select,
      where: this._where,
      orderBy: this._orderBy,
      limit: this._limitVal,
    });
  }
  [Symbol.for('nodejs.util.promisify.custom')]() {
    return this.execute();
  }
  get [Symbol.toStringTag]() {
    return 'LocalQuery';
  }
}

// ============================================================
// Agent Traces ORM
// ============================================================

function insertTrace(trace) {
  const db = getDb();
  const stmt = db.prepare(`INSERT INTO agent_traces 
    (id, session_id, message_id, trace_type, agent_name, tool_name, tool_input, tool_output, 
     tool_status, content, duration_ms, time_start, time_end, metadata)
    VALUES (@id, @session_id, @message_id, @trace_type, @agent_name, @tool_name, @tool_input, @tool_output,
            @tool_status, @content, @duration_ms, @time_start, @time_end, @metadata)`);
  return stmt.run({
    id: trace.id || crypto.randomUUID(),
    session_id: trace.session_id,
    message_id: trace.message_id || null,
    trace_type: trace.trace_type,
    agent_name: trace.agent_name || null,
    tool_name: trace.tool_name || null,
    tool_input: trace.tool_input ? JSON.stringify(trace.tool_input) : null,
    tool_output: trace.tool_output || null,
    tool_status: trace.tool_status || null,
    content: trace.content || null,
    duration_ms: trace.duration_ms || null,
    time_start: trace.time_start || null,
    time_end: trace.time_end || null,
    metadata: trace.metadata ? JSON.stringify(trace.metadata) : null,
  });
}

function getTracesBySession(sessionId, options = {}) {
  const db = getDb();
  let query = 'SELECT * FROM agent_traces WHERE session_id = ?';
  const params = [sessionId];

  if (options.message_id) {
    query += ' AND message_id = ?';
    params.push(options.message_id);
  }
  if (options.trace_type) {
    query += ' AND trace_type = ?';
    params.push(options.trace_type);
  }
  if (options.tool_name) {
    query += ' AND tool_name = ?';
    params.push(options.tool_name);
  }
  if (options.tool_status) {
    query += ' AND tool_status = ?';
    params.push(options.tool_status);
  }

  query += ' ORDER BY created_at ASC';

  if (options.limit) {
    query += ' LIMIT ?';
    params.push(options.limit);
  }

  const rows = db.prepare(query).all(...params);
  return rows.map((r) => ({
    ...r,
    tool_input: r.tool_input ? JSON.parse(r.tool_input) : null,
    metadata: r.metadata ? JSON.parse(r.metadata) : null,
  }));
}

/**
 * Sanitize a search term for FTS5 MATCH syntax.
 * FTS5 interprets special characters as operators: " * + - ( ) / \ : ^ $ ~
 * AND, OR, NOT are also operators.
 * Wrapping in double quotes and escaping internal quotes makes it a literal phrase search.
 */
function sanitizeFtsQuery(term) {
  if (!term || typeof term !== 'string') return '';
  // Escape double quotes inside the term
  const escaped = term.replace(/"/g, '""');
  // Wrap in double quotes for literal phrase matching
  return `"${escaped}"`;
}

function searchTraces(sessionId, searchTerm, options = {}) {
  const db = getDb();
  const safeTerm = sanitizeFtsQuery(searchTerm);
  if (!safeTerm) return [];
  const query = `
    SELECT t.*, fts.rank
    FROM agent_traces t
    JOIN agent_traces_fts fts ON t.rowid = fts.rowid
    WHERE t.session_id = ? AND agent_traces_fts MATCH ?
    ORDER BY fts.rank
    LIMIT ?
  `;
  const rows = db.prepare(query).all(sessionId, safeTerm, options.limit || 50);
  return rows.map((r) => ({
    ...r,
    tool_input: r.tool_input ? JSON.parse(r.tool_input) : null,
    metadata: r.metadata ? JSON.parse(r.metadata) : null,
  }));
}

function updateTrace(id, updates) {
  const db = getDb();
  const setClauses = [];
  const params = [];

  for (const [key, value] of Object.entries(updates)) {
    if (key === 'tool_input' || key === 'metadata') {
      setClauses.push(`${key} = ?`);
      params.push(value ? JSON.stringify(value) : null);
    } else {
      setClauses.push(`${key} = ?`);
      params.push(value);
    }
  }

  // Preserve original id — changing PK on conflict breaks references
  setClauses.push('id = agent_traces.id');
  setClauses.push("updated_at = datetime('now')");
  params.push(id);

  const query = `UPDATE agent_traces SET ${setClauses.join(', ')} WHERE id = ?`;
  return db.prepare(query).run(...params);
}

/**
 * Idempotent upsert for trace parts.
 * Upsert key: (session_id, part_id) — falls back to trace.id when part_id is missing.
 * Uses ON CONFLICT DO UPDATE to avoid FTS5 DELETE triggers (INSERT OR REPLACE would fire them).
 */
function upsertTrace(trace) {
  const db = getDb();
  const partId = trace.part_id || trace.id || crypto.randomUUID();
  const traceId = trace.id || crypto.randomUUID();

  const stmt = db.prepare(`
    INSERT INTO agent_traces 
      (id, session_id, message_id, part_id, trace_type, agent_name, tool_name, 
       tool_input, tool_output, tool_status, content, duration_ms, time_start, time_end, metadata)
    VALUES (@id, @session_id, @message_id, @part_id, @trace_type, @agent_name, @tool_name,
            @tool_input, @tool_output, @tool_status, @content, @duration_ms, @time_start, @time_end, @metadata)
    ON CONFLICT(session_id, part_id) DO UPDATE SET
      message_id = COALESCE(excluded.message_id, agent_traces.message_id),
      trace_type = excluded.trace_type,
      agent_name = COALESCE(excluded.agent_name, agent_traces.agent_name),
      tool_name = COALESCE(excluded.tool_name, agent_traces.tool_name),
      tool_input = COALESCE(excluded.tool_input, agent_traces.tool_input),
      tool_output = COALESCE(excluded.tool_output, agent_traces.tool_output),
      tool_status = excluded.tool_status,
      content = COALESCE(NULLIF(excluded.content, ''), NULLIF(agent_traces.content, '')),
      duration_ms = COALESCE(excluded.duration_ms, agent_traces.duration_ms),
      time_start = COALESCE(excluded.time_start, agent_traces.time_start),
      time_end = COALESCE(excluded.time_end, agent_traces.time_end),
      metadata = COALESCE(excluded.metadata, agent_traces.metadata),
      created_at = COALESCE(agent_traces.created_at, excluded.created_at),
      updated_at = datetime('now')
  `);

  return stmt.run({
    id: traceId,
    session_id: trace.session_id,
    message_id: trace.message_id || null,
    part_id: partId,
    trace_type: trace.trace_type,
    agent_name: trace.agent_name || null,
    tool_name: trace.tool_name || null,
    tool_input: trace.tool_input ? JSON.stringify(trace.tool_input) : null,
    tool_output: trace.tool_output
      ? typeof trace.tool_output === 'string'
        ? trace.tool_output
        : JSON.stringify(trace.tool_output)
      : null,
    tool_status: trace.tool_status || null,
    content: trace.content || null,
    duration_ms: trace.duration_ms || null,
    time_start: trace.time_start || null,
    time_end: trace.time_end || null,
    metadata: trace.metadata ? JSON.stringify(trace.metadata) : null,
  });
}

// ============================================================
// Session Usage ORM
// ============================================================

function upsertSessionUsage(data) {
  const db = getDb();
  const stmt = db.prepare(`
    INSERT INTO agent_session_usage 
      (id, session_id, prompt_tokens, completion_tokens, total_tokens, 
       context_window_size, context_utilization, tool_calls_count, total_duration_ms)
    VALUES (@id, @session_id, @prompt_tokens, @completion_tokens, @total_tokens,
            @context_window_size, @context_utilization, @tool_calls_count, @total_duration_ms)
    ON CONFLICT(session_id) DO UPDATE SET
      prompt_tokens = excluded.prompt_tokens,
      completion_tokens = excluded.completion_tokens,
      total_tokens = excluded.total_tokens,
      context_window_size = excluded.context_window_size,
      context_utilization = excluded.context_utilization,
      tool_calls_count = excluded.tool_calls_count,
      total_duration_ms = excluded.total_duration_ms,
      updated_at = datetime('now')
  `);
  return stmt.run({
    id: data.id || crypto.randomUUID(),
    session_id: data.session_id,
    prompt_tokens: data.prompt_tokens || 0,
    completion_tokens: data.completion_tokens || 0,
    total_tokens: data.total_tokens || 0,
    context_window_size: data.context_window_size || null,
    context_utilization: data.context_utilization || 0,
    tool_calls_count: data.tool_calls_count || 0,
    total_duration_ms: data.total_duration_ms || 0,
  });
}

function getSessionUsage(sessionId) {
  const db = getDb();
  return db.prepare('SELECT * FROM agent_session_usage WHERE session_id = ?').get(sessionId);
}

// ============================================================
// Telegram Session Map ORM
// ============================================================

function getTelegramSession(chatId) {
  const db = getDb();
  return db
    .prepare('SELECT * FROM telegram_session_map WHERE telegram_chat_id = ? AND active = 1')
    .get(chatId);
}

function createTelegramSession(chatId, sessionId, projectId) {
  const db = getDb();
  const stmt = db.prepare(`
    INSERT INTO telegram_session_map (telegram_chat_id, session_id, project_id, active)
    VALUES (?, ?, ?, 1)
    ON CONFLICT(telegram_chat_id) DO UPDATE SET
      session_id = excluded.session_id,
      project_id = excluded.project_id,
      active = 1,
      updated_at = datetime('now')
  `);
  return stmt.run(chatId, sessionId, projectId || null);
}

// ============================================================
// Agent Hub Messages ORM
// ============================================================

function insertMessage(data) {
  const db = getDb();
  const stmt = db.prepare(`INSERT INTO agent_hub_messages
    (id, session_id, role, content, meta, source, tool_call_id, tool_name)
    VALUES (@id, @session_id, @role, @content, @meta, @source, @tool_call_id, @tool_name)`);
  return stmt.run({
    id: data.id || crypto.randomUUID(),
    session_id: data.session_id,
    role: data.role,
    content: data.content,
    meta: data.meta ? JSON.stringify(data.meta) : null,
    source: data.source || 'web',
    tool_call_id: data.tool_call_id || null,
    tool_name: data.tool_name || null,
  });
}

function getMessagesBySession(sessionId, options = {}) {
  const db = getDb();
  let query = 'SELECT * FROM agent_hub_messages WHERE session_id = ?';
  const params = [sessionId];

  if (options.role) {
    query += ' AND role = ?';
    params.push(options.role);
  }
  if (options.source) {
    query += ' AND source = ?';
    params.push(options.source);
  }

  query += ' ORDER BY created_at ASC';

  if (options.limit) {
    query += ' LIMIT ?';
    params.push(options.limit);
  }

  const rows = db.prepare(query).all(...params);
  return rows.map((r) => ({
    ...r,
    meta: r.meta ? JSON.parse(r.meta) : null,
  }));
}

function getToolTracesBySession(sessionId, options = {}) {
  const db = getDb();
  let query = 'SELECT * FROM agent_traces WHERE session_id = ? AND trace_type LIKE ?';
  const params = [sessionId, 'tool%'];

  if (options.tool_status) {
    query += ' AND tool_status = ?';
    params.push(options.tool_status);
  }
  if (options.tool_name) {
    query += ' AND tool_name = ?';
    params.push(options.tool_name);
  }

  query += ' ORDER BY created_at ASC';

  if (options.limit) {
    query += ' LIMIT ?';
    params.push(options.limit);
  }

  const rows = db.prepare(query).all(...params);
  return rows.map((r) => ({
    ...r,
    tool_input: r.tool_input ? JSON.parse(r.tool_input) : null,
    metadata: r.metadata ? JSON.parse(r.metadata) : null,
  }));
}

function getSessionsByProject(projectId, options = {}) {
  const { includeHidden } = options;
  const db = getDb();

  let whereClause = 'WHERE s.project_id = ?';
  const params = [projectId];

  if (includeHidden === 'active') {
    // Include visible + hidden_active
    whereClause += " AND s.visibility IN ('visible', 'hidden_active')";
  } else if (includeHidden === 'history') {
    // Include visible + hidden_history
    whereClause += " AND s.visibility IN ('visible', 'hidden_history')";
  } else if (includeHidden === 'all') {
    // Include everything
  } else {
    // Default: exclude hidden_all
    whereClause += " AND s.visibility != 'hidden_all'";
  }

  return db
    .prepare(
      `
    SELECT s.*, tsm.telegram_chat_id 
    FROM agent_hub_sessions s
    LEFT JOIN telegram_session_map tsm ON s.id = tsm.session_id
    ${whereClause}
    ORDER BY s.updated_at DESC
  `
    )
    .all(...params);
}

function getRecentSessions(limit = 20, options = {}) {
  const { includeHidden } = options;
  const db = getDb();

  let whereClause = '';
  const params = [limit];

  if (includeHidden === 'active') {
    whereClause = " WHERE s.visibility IN ('visible', 'hidden_active')";
  } else if (includeHidden === 'history') {
    whereClause = " WHERE s.visibility IN ('visible', 'hidden_history')";
  } else if (includeHidden === 'all') {
    // Include everything
  } else {
    // Default: exclude hidden_all
    whereClause = " WHERE s.visibility != 'hidden_all'";
  }

  return db
    .prepare(
      `
    SELECT s.*, tsm.telegram_chat_id 
    FROM agent_hub_sessions s
    LEFT JOIN telegram_session_map tsm ON s.id = tsm.session_id
    ${whereClause}
    ORDER BY s.updated_at DESC
    LIMIT ?
  `
    )
    .all(...params);
}

function getSessionsByTelegramChat(chatId, limit = 20) {
  const db = getDb();
  return db
    .prepare(
      `
    SELECT s.* FROM agent_hub_sessions s
    JOIN telegram_session_map tsm ON s.id = tsm.session_id
    WHERE tsm.telegram_chat_id = ?
    ORDER BY s.updated_at DESC
    LIMIT ?
  `
    )
    .all(chatId, limit);
}

function updateSessionStatus(sessionId, status) {
  const db = getDb();
  return db
    .prepare("UPDATE agent_hub_sessions SET status = ?, updated_at = datetime('now') WHERE id = ?")
    .run(status, sessionId);
}

/**
 * Marks a session as failed and stores the error message for UI display.
 */
function updateSessionError(sessionId, errorMessage) {
  const db = getDb();
  return db
    .prepare(
      "UPDATE agent_hub_sessions SET status = 'error', error_message = ?, updated_at = datetime('now') WHERE id = ?"
    )
    .run(errorMessage || 'Unknown error', sessionId);
}

function updateSessionOpenCodeId(sessionId, opencodeSessionId) {
  const db = getDb();
  return db
    .prepare(
      "UPDATE agent_hub_sessions SET opencode_session_id = ?, updated_at = datetime('now') WHERE id = ?"
    )
    .run(opencodeSessionId, sessionId);
}

// ============================================================
// Swarm Config Helpers
// ============================================================

function getSwarmConfig() {
  const db = getDb();
  const rows = db.prepare('SELECT key, value FROM swarm_config').all();
  const config = {};
  for (const row of rows) {
    config[row.key] = row.value;
  }
  return config;
}

function setSwarmConfig(key, value) {
  const db = getDb();
  db.prepare(
    "INSERT INTO swarm_config (key, value, updated_at) VALUES (?, ?, datetime('now')) ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = datetime('now')"
  ).run(key, String(value));
}

// ============================================================
// Swarm Process Helpers
// ============================================================

function registerSwarmProcess(data) {
  const db = getDb();
  const id = data.id || crypto.randomUUID();
  db.prepare(
    `INSERT INTO swarm_processes (id, pid, port, status, cwd, started_at, last_heartbeat, metadata)
     VALUES (?, ?, ?, ?, ?, datetime('now'), datetime('now'), ?)`
  ).run(
    id,
    data.pid || null,
    data.port,
    data.status || 'starting',
    data.cwd || null,
    data.metadata ? JSON.stringify(data.metadata) : null
  );
  return id;
}

function updateSwarmProcess(id, updates) {
  const db = getDb();
  const setClauses = [];
  const params = [];
  for (const [key, value] of Object.entries(updates)) {
    if (key === 'metadata' && typeof value === 'object') {
      setClauses.push(`${key} = ?`);
      params.push(JSON.stringify(value));
    } else {
      setClauses.push(`${key} = ?`);
      params.push(value);
    }
  }
  setClauses.push("last_heartbeat = datetime('now')");
  params.push(id);
  const query = `UPDATE swarm_processes SET ${setClauses.join(', ')} WHERE id = ?`;
  return db.prepare(query).run(...params);
}

function getSwarmProcesses() {
  const db = getDb();
  const rows = db.prepare('SELECT * FROM swarm_processes ORDER BY started_at DESC').all();
  return rows.map((r) => ({
    ...r,
    metadata: r.metadata ? JSON.parse(r.metadata) : null,
  }));
}

function removeSwarmProcess(id) {
  const db = getDb();
  return db.prepare('DELETE FROM swarm_processes WHERE id = ?').run(id);
}

function getActiveSwarmCount() {
  const db = getDb();
  const row = db
    .prepare(
      "SELECT COUNT(*) as count FROM swarm_processes WHERE status IN ('running', 'starting')"
    )
    .get();
  return row.count;
}

/**
 * Count active agent sessions from agent_hub_sessions table.
 * Used for concurrency enforcement.
 */
/**
 * Count active agent sessions from agent_hub_sessions table.
 * Used for concurrency enforcement.
 */
/**
 * Count active agent sessions from agent_hub_sessions table.
 * Used for concurrency enforcement.
 */
function getActiveAgentCount() {
  const db = getDb();
  const row = db
    .prepare("SELECT COUNT(*) as count FROM agent_hub_sessions WHERE status = 'active'")
    .get();
  return row.count;
}

// ============================================================
// Session Hierarchy (parent/child navigation)
// ============================================================
// Session Hierarchy (parent/child navigation)
// ============================================================

function getSessionWithParent(sessionId) {
  const db = getDb();
  return db
    .prepare(
      `
      SELECT s.*, p.id AS parent_id, p.title AS parent_title
      FROM agent_hub_sessions s
      LEFT JOIN agent_hub_sessions p ON s.parent_id = p.id
      WHERE s.id = ?
    `
    )
    .get(sessionId);
}

function getChildSessions(parentId) {
  const db = getDb();
  return db
    .prepare(
      `
      SELECT * FROM agent_hub_sessions
      WHERE parent_id = ?
      ORDER BY created_at ASC
    `
    )
    .all(parentId);
}

function getSessionChain(sessionId) {
  const db = getDb();
  const chain = [];
  let current = db.prepare('SELECT * FROM agent_hub_sessions WHERE id = ?').get(sessionId);
  while (current) {
    chain.unshift({
      id: current.id,
      title: current.title,
      isRoot: !current.parent_id,
    });
    if (current.parent_id) {
      current = db.prepare('SELECT * FROM agent_hub_sessions WHERE id = ?').get(current.parent_id);
    } else {
      break;
    }
  }
  return chain;
}

function getSiblingSessions(sessionId) {
  const db = getDb();
  const current = db
    .prepare('SELECT parent_id FROM agent_hub_sessions WHERE id = ?')
    .get(sessionId);
  if (!current || !current.parent_id) return [];
  return db
    .prepare(
      `
      SELECT * FROM agent_hub_sessions
      WHERE parent_id = ? AND id != ?
      ORDER BY created_at ASC
    `
    )
    .all(current.parent_id, sessionId);
}

module.exports = {
  AGENT_WORKSPACE_BASE_COMMIT,
  getDb,
  closeDb,
  ensureRuntimeSchema,
  buildPrepareAgentWorkspaceAck,
  buildWorkspaceIntentId,
  prepareAgentWorkspaceLease,
  createAgentRun,
  updateAgentRunTerminal,
  appendAgentArtifact,
  getAgentRunById,
  getLatestAgentRunForWorkspace,
  getLatestAgentRunForTask,
  resolveAgentRuntimeBinding,
  listAgentRuns,
  listAgentArtifacts,
  getLatestAgentArtifactForRun,
  createSwarmMission,
  getSwarmMissionById,
  registerMissionParticipant,
  listMissionParticipants,
  getVerifiedMissionRecipientBinding,
  createMissionMessage,
  listMissionMessages,
  upsertMessageDelivery,
  listMessageDeliveriesForMission,
  upsertAgentPresence,
  listAgentPresenceForMission,
  getAgentPresenceStatus,
  getSwarmMissionDirectorSnapshot,
  buildSupervisorApprovalCheckpointKey,
  getLatestTaskComment,
  getSupervisorSnapshot,
  listSupervisorSnapshots,
  upsertSupervisorSnapshot,
  getSupervisorApprovalCheckpoint,
  listSupervisorApprovalCheckpoints,
  upsertSupervisorApprovalCheckpoint,
  buildTelegramIntentIdempotencyKey,
  getTelegramActorMappingByTelegramUser,
  upsertTelegramActorMapping,
  getTelegramIntentByIdempotencyKey,
  recordTelegramIntentEnvelope,
  upsertTelegramDeliveryReceipt,
  buildTelegramSubscriptionKey,
  upsertTelegramSubscription,
  getLatestTelegramChannelSnapshot,
  tables,
  from(table) {
    return new LocalQuery(table);
  },
  db: tables,
  // Agent Traces
  insertTrace,
  upsertTrace,
  getTracesBySession,
  searchTraces,
  updateTrace,
  // Agent Hub Messages
  insertMessage,
  getMessagesBySession,
  getToolTracesBySession,
  // Session Usage
  upsertSessionUsage,
  getSessionUsage,
  // Telegram Session Map
  getTelegramSession,
  createTelegramSession,
  getSessionsByProject,
  getRecentSessions,
  getSessionsByTelegramChat,
  updateSessionStatus,
  updateSessionError,
  updateSessionOpenCodeId,
  // Session Hierarchy
  getSessionWithParent,
  getChildSessions,
  getSessionChain,
  getSiblingSessions,
  // Swarm Config
  getSwarmConfig,
  setSwarmConfig,
  // Swarm Processes
  registerSwarmProcess,
  updateSwarmProcess,
  getSwarmProcesses,
  removeSwarmProcess,
  getActiveSwarmCount,
  // Active Agent Count
  getActiveAgentCount,
};
