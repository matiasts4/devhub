/**
 * @module core
 * Singleton DB handle, schema bootstrap, query builders, and table ops.
 * All other domain modules import from here.
 */

'use strict';

const Database = require('better-sqlite3');
const fs = require('fs');
const path = require('path');
const { resolveDbPath } = require('./pathResolver');

// ---------------------------------------------------------------------------
// Singleton
// ---------------------------------------------------------------------------

const DB_PATH = resolveDbPath();
let _db = null;

// ---------------------------------------------------------------------------
// Constants (workspace / supervisor / telegram / swarm)
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// Schema
// ---------------------------------------------------------------------------

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
      if (!e.message.includes('duplicate column name') && !e.message.includes('no such table')) {
        throw e;
      }
    }
  }

  db.exec(
    "UPDATE projects SET documentation_policy = 'personal' WHERE documentation_policy IS NULL"
  );

  db.exec(`
    CREATE UNIQUE INDEX IF NOT EXISTS idx_traces_session_part 
      ON agent_traces(session_id, part_id);
  `);

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

  db.exec(
    `CREATE INDEX IF NOT EXISTS idx_agent_hub_sessions_parent ON agent_hub_sessions(parent_id)`
  );

  db.exec(
    `CREATE UNIQUE INDEX IF NOT EXISTS idx_agent_workspaces_active_branch
      ON agent_workspaces(branch_name)
      WHERE branch_name IS NOT NULL AND status IN (${AGENT_WORKSPACE_ACTIVE_LOCK_STATUSES.map((s) => `'${s}'`).join(', ')})`
  );

  db.exec(
    `CREATE UNIQUE INDEX IF NOT EXISTS idx_agent_workspaces_active_worktree
      ON agent_workspaces(worktree_path)
      WHERE worktree_path IS NOT NULL AND status IN (${AGENT_WORKSPACE_ACTIVE_LOCK_STATUSES.map((s) => `'${s}'`).join(', ')})`
  );

  db.exec(
    `CREATE UNIQUE INDEX IF NOT EXISTS idx_agent_workspaces_active_owner
      ON agent_workspaces(agent_id, current_task_id)
      WHERE current_task_id IS NOT NULL AND status IN (${AGENT_WORKSPACE_ACTIVE_LOCK_STATUSES.map((s) => `'${s}'`).join(', ')})`
  );

  db.exec(`
    CREATE TRIGGER IF NOT EXISTS agent_workspaces_terminal_immutable
    BEFORE UPDATE ON agent_workspaces
    FOR EACH ROW
    WHEN OLD.status IN (${AGENT_WORKSPACE_TERMINAL_STATUSES.map((s) => `'${s}'`).join(', ')})
    BEGIN
      SELECT RAISE(ABORT, 'agent_workspaces_terminal_immutable');
    END;
  `);
}

// ---------------------------------------------------------------------------
// Singleton access
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// Query builders
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// Delete helpers
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// Table ops factory
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// Tables registry
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// LocalQuery
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// Generic db-handle resolver
// ---------------------------------------------------------------------------

/**
 * Resolves (db, input) overloaded calling convention.
 * Callers may pass (db, input) or (input) — resolving the singleton in the latter case.
 */
function resolveDbArgs(dbOrInput, maybeInput) {
  if (dbOrInput && typeof dbOrInput.prepare === 'function') {
    return { db: dbOrInput, input: maybeInput || {} };
  }
  return { db: getDb(), input: dbOrInput || {} };
}

// ---------------------------------------------------------------------------
// Agent run lookup (shared by artifacts and agentRuns modules)
// ---------------------------------------------------------------------------

function getAgentRunById(dbOrRunId, maybeRunId) {
  const hasDb = dbOrRunId && typeof dbOrRunId.prepare === 'function';
  const db = hasDb ? dbOrRunId : getDb();
  const runId = hasDb ? maybeRunId : dbOrRunId;
  if (!runId) return null;
  return db.prepare('SELECT * FROM agent_runs WHERE run_id = ? LIMIT 1').get(runId) || null;
}

// ---------------------------------------------------------------------------
// Exports
// ---------------------------------------------------------------------------

module.exports = {
  // singleton
  getDb,
  closeDb,
  // generic helpers
  resolveDbArgs,
  getAgentRunById,
  // schema
  ensureRuntimeSchema,
  // query builders
  buildSelectQuery,
  buildWhere,
  tableExists,
  tableHasColumn,
  // delete helpers
  deleteByProjectId,
  deleteByValues,
  deleteProjectCascadeUnsafe,
  // table ops
  makeTableOps,
  tables,
  // query class
  LocalQuery,
  // constants
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
