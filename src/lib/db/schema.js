const {
  AGENT_WORKSPACE_TERMINAL_STATUSES,
  AGENT_WORKSPACE_BASE_COMMIT,
  AGENT_WORKSPACE_ACTIVE_LOCK_STATUSES,
} = require('./constants');
const { LOCAL_USER_ID, LOCAL_WORKSPACE_ID } = require('../constants/local');

const AGENT_EVENT_TYPES = [
  'agent_booted',
  'agent_shutdown',
  'workspace_orphaned',
  'quota_blocked',
  'supervisor_action',
  'mission_joined',
  'mission_left',
  'task_completed',
  'handoff_ready',
];

/**
 * Seed the singleton `(local-ws, local-user, owner)` row on first boot.
 * Idempotent: subsequent calls are no-ops. This keeps local mode
 * byte-identical to the pre-change behavior (REQ-TEN-4, regression budget).
 */
function seedLocalTenancy(db) {
  // Tables may not exist yet on a brand-new DB that has not run the
  // CREATE TABLE block above. Use a defensive check.
  if (!db) return;
  try {
    db.prepare('SELECT 1 FROM workspaces LIMIT 1').get();
  } catch {
    return;
  }
  db.prepare(`INSERT OR IGNORE INTO workspaces (id, name, slug, owner_id) VALUES (?, ?, ?, ?)`).run(
    LOCAL_WORKSPACE_ID,
    'local',
    'local',
    LOCAL_USER_ID
  );
  db.prepare(
    `INSERT OR IGNORE INTO workspace_members (workspace_id, user_id, role) VALUES (?, ?, ?)`
  ).run(LOCAL_WORKSPACE_ID, LOCAL_USER_ID, 'owner');
}

function rebuildAgentEventsTableIfNeeded(db) {
  const tableInfo = db.prepare(`PRAGMA table_info(agent_events)`).all();
  if (tableInfo.length === 0) return;

  const createSqlRow = db
    .prepare(`SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'agent_events' LIMIT 1`)
    .get();
  const createSql = String(createSqlRow?.sql || '');
  const missingType = AGENT_EVENT_TYPES.find((eventType) => !createSql.includes(`'${eventType}'`));
  if (!missingType) return;

  db.exec(`
    BEGIN;
    ALTER TABLE agent_events RENAME TO agent_events_legacy;
    CREATE TABLE agent_events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      agent_id TEXT NOT NULL,
      workspace_id TEXT,
      event_type TEXT NOT NULL CHECK(event_type IN (${AGENT_EVENT_TYPES.map((eventType) => `'${eventType}'`).join(',')})),
      payload_json TEXT,
      mission_id TEXT,
      client_event_id TEXT,
      created_at TEXT NOT NULL DEFAULT(datetime('now')),
      FOREIGN KEY(workspace_id) REFERENCES agent_workspaces(id)
    );
    INSERT INTO agent_events (id, agent_id, workspace_id, event_type, payload_json, mission_id, client_event_id, created_at)
    SELECT id, agent_id, workspace_id, event_type, payload_json, mission_id, client_event_id, created_at
    FROM agent_events_legacy;
    DROP TABLE agent_events_legacy;
    CREATE INDEX idx_agent_events_agent_id ON agent_events(agent_id);
    CREATE INDEX idx_agent_events_type ON agent_events(event_type);
    CREATE INDEX idx_agent_events_created_at ON agent_events(created_at);
    CREATE INDEX idx_agent_events_client_event_id ON agent_events(client_event_id);
    COMMIT;
  `);
}

function ensureRuntimeSchema(db) {
  if (typeof db.pragma === 'function') {
    db.pragma('foreign_keys = ON');
  }

  db.exec(`
    CREATE TABLE IF NOT EXISTS projects (
      id TEXT PRIMARY KEY,
      user_id TEXT,
      workspace_id TEXT,
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

    CREATE TABLE IF NOT EXISTS task_comments (
      id TEXT PRIMARY KEY,
      task_id TEXT NOT NULL,
      user_id TEXT,
      content TEXT NOT NULL,
      author_type TEXT DEFAULT 'agent',
      created_at TEXT DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_task_comments_task ON task_comments(task_id);

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

    CREATE TABLE IF NOT EXISTS swarm_config (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL,
      updated_at TEXT DEFAULT (datetime('now'))
    );

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
      status TEXT NOT NULL CHECK(status IN ('pending', 'sent', 'failed', 'retry_pending', 'expired', 'consumed')),
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
      presence_state TEXT NOT NULL CHECK(presence_state IN ('online', 'busy', 'idle', 'waiting', 'offline', 'booting', 'crashed')),
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

    CREATE TABLE IF NOT EXISTS swarm_queue_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      queue_name TEXT NOT NULL,
      payload_json TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending',
      enqueued_at TEXT NOT NULL DEFAULT (datetime('now')),
      acquired_at TEXT,
      acked_at TEXT,
      retries INTEGER NOT NULL DEFAULT 0,
      max_retries INTEGER NOT NULL DEFAULT 3,
      error_message TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_sqi_queue_status ON swarm_queue_items(queue_name, status);
    CREATE INDEX IF NOT EXISTS idx_sqi_status_enqueued ON swarm_queue_items(status, enqueued_at);

    CREATE TABLE IF NOT EXISTS agent_auth_tokens (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      agent_id TEXT NOT NULL,
      workspace_id TEXT,
      token_hash TEXT NOT NULL,
      secret TEXT,
      algorithm TEXT NOT NULL DEFAULT 'hmac-sha256',
      status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active', 'revoked', 'expired')),
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      revoked_at TEXT,
      expires_at TEXT,
      FOREIGN KEY (workspace_id) REFERENCES agent_workspaces(id)
    );
    CREATE INDEX IF NOT EXISTS idx_auth_tokens_agent ON agent_auth_tokens(agent_id);
    CREATE INDEX IF NOT EXISTS idx_auth_tokens_status ON agent_auth_tokens(status);

    CREATE TABLE IF NOT EXISTS agent_events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      agent_id TEXT NOT NULL,
      workspace_id TEXT,
      event_type TEXT NOT NULL CHECK(event_type IN (${AGENT_EVENT_TYPES.map((eventType) => `'${eventType}'`).join(',')})),
      payload_json TEXT,
      mission_id TEXT,
      client_event_id TEXT,
      created_at TEXT NOT NULL DEFAULT(datetime('now')),
      FOREIGN KEY(workspace_id) REFERENCES agent_workspaces(id)
    );
    CREATE INDEX IF NOT EXISTS idx_agent_events_agent_id ON agent_events(agent_id);
    CREATE INDEX IF NOT EXISTS idx_agent_events_type ON agent_events(event_type);
    CREATE INDEX IF NOT EXISTS idx_agent_events_created_at ON agent_events(created_at);
    CREATE INDEX IF NOT EXISTS idx_agent_events_client_event_id ON agent_events(client_event_id);

    CREATE TABLE IF NOT EXISTS operator_inbox (
      inbox_id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL,
      actor_id TEXT NOT NULL,
      category TEXT NOT NULL CHECK(category IN ('approval_request','approval_result','supervisor_action','task_claimed','task_released','task_blocked','agent_event','system')),
      source_table TEXT NOT NULL,
      source_id TEXT NOT NULL,
      message TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'unread' CHECK(status IN ('unread','read','dismissed')),
      created_at TEXT NOT NULL DEFAULT(datetime('now')),
      updated_at TEXT NOT NULL DEFAULT(datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_operator_inbox_project ON operator_inbox(project_id);
    CREATE INDEX IF NOT EXISTS idx_operator_inbox_actor ON operator_inbox(actor_id);
    CREATE INDEX IF NOT EXISTS idx_operator_inbox_status ON operator_inbox(status);
    CREATE INDEX IF NOT EXISTS idx_operator_inbox_created ON operator_inbox(created_at DESC);

    CREATE TABLE IF NOT EXISTS task_history (
      history_id INTEGER PRIMARY KEY AUTOINCREMENT,
      task_id TEXT NOT NULL,
      actor_id TEXT,
      action TEXT NOT NULL,
      from_status TEXT,
      to_status TEXT,
      metadata TEXT,
      created_at TEXT NOT NULL DEFAULT(datetime('now')),
      FOREIGN KEY(task_id) REFERENCES tasks(id)
    );
    CREATE INDEX IF NOT EXISTS idx_task_history_task ON task_history(task_id);
    CREATE INDEX IF NOT EXISTS idx_task_history_created ON task_history(created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_task_history_action ON task_history(action);

    -- operator_timeline: append-only execution event log
    CREATE TABLE IF NOT EXISTS operator_timeline (
      id              INTEGER PRIMARY KEY AUTOINCREMENT,
      item_id         TEXT NOT NULL,
      execution_id    TEXT NOT NULL,
      correlation_id  TEXT NOT NULL,
      sequence        INTEGER NOT NULL,
      actor_type      TEXT NOT NULL CHECK(actor_type IN ('human','operator','director','system')),
      actor_id        TEXT NOT NULL,
      actor_role      TEXT NOT NULL,
      stage           TEXT NOT NULL CHECK(stage IN (
        'action_request','policy_evaluation','tool_invocation','execution_progress',
        'rollback','deferred','audit_recorded'
      )),
      status          TEXT NOT NULL CHECK(status IN (
        'requested','policy_approved','policy_denied','invoked','running',
        'completed','failed','rolled_back','deferred'
      )),
      tool_name        TEXT,
      params          TEXT,
      evidence_refs   TEXT NOT NULL DEFAULT '[]',
      redaction_level TEXT NOT NULL DEFAULT 'none' CHECK(redaction_level IN ('none','params_only','full')),
      occurred_at     TEXT NOT NULL,
      authority       TEXT NOT NULL DEFAULT 'primary' CHECK(authority IN ('primary','secondary_hint')),
      next_step_hint  TEXT,
      error_code       TEXT,
      error_message    TEXT,
      error_recoverable INTEGER,
      created_at       TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE(execution_id, sequence)
    );
    CREATE INDEX IF NOT EXISTS idx_ot_execution ON operator_timeline(execution_id, sequence ASC);
    CREATE INDEX IF NOT EXISTS idx_ot_occurred  ON operator_timeline(occurred_at DESC);
    CREATE INDEX IF NOT EXISTS idx_ot_actor      ON operator_timeline(actor_id, occurred_at DESC);
    CREATE INDEX IF NOT EXISTS idx_ot_item_id    ON operator_timeline(item_id);

    CREATE TRIGGER IF NOT EXISTS operator_timeline_append_only
    BEFORE UPDATE ON operator_timeline
    FOR EACH ROW
    BEGIN
      SELECT RAISE(ABORT, 'operator_timeline_append_only');
    END;

    -- dg_timeline: append-only DG bridge mission timeline rows
    CREATE TABLE IF NOT EXISTS dg_timeline (
      id TEXT NOT NULL,
      mission_id      TEXT NOT NULL,
      timestamp INTEGER NOT NULL,
      initiator TEXT NOT NULL CHECK(initiator IN ('operator','director-general','swarm-director')),
      target          TEXT NOT NULL CHECK(target IN ('director-general','swarm-director','operator')),
      action          TEXT NOT NULL CHECK(action IN ('mission-request','status-poll','approval-required','mission-result')),
      status          TEXT NOT NULL CHECK(status IN ('pending','waiting','in-progress','awaiting-approval','completed','rejected','failed')),
      authority       TEXT NOT NULL CHECK(authority IN ('operator','operator-initiated','director','director-escalated')),
      freshness TEXT NOT NULL CHECK(freshness IN ('just_now','stale','unknown')),
      fallback TEXT NOT NULL DEFAULT '',
      created_at      TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE(id, mission_id)
    );
    CREATE INDEX IF NOT EXISTS idx_dg_timeline_mission ON dg_timeline(mission_id, timestamp ASC);
    CREATE INDEX IF NOT EXISTS idx_dg_timeline_timestamp ON dg_timeline(timestamp DESC);

    -- devhub-cloud-foundation (PR 2): tenancy tables. Forward-only and
    -- additive. Existing tables above are untouched. REQ-TEN-1, REQ-TEN-4.

    CREATE TABLE IF NOT EXISTS workspaces (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      slug TEXT UNIQUE NOT NULL,
      created_at TEXT NOT NULL DEFAULT(datetime('now')),
      owner_id TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS workspace_members (
      workspace_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      role TEXT NOT NULL CHECK(role IN ('owner','admin','member','viewer')),
      joined_at TEXT NOT NULL DEFAULT(datetime('now')),
      PRIMARY KEY (workspace_id, user_id),
      FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS project_members (
      project_id TEXT NOT NULL,
      user_id TEXT,
      role TEXT NOT NULL CHECK(role IN ('owner','admin','member','viewer')),
      joined_at TEXT NOT NULL DEFAULT(datetime('now')),
      invited_email TEXT,
      invite_token TEXT,
      invited_at TEXT,
      accepted_at TEXT,
      invited_by TEXT,
      PRIMARY KEY (project_id, user_id)
    );
    CREATE INDEX IF NOT EXISTS idx_project_members_user ON project_members(user_id);

    CREATE TABLE IF NOT EXISTS workspace_invitations (
      workspace_id TEXT NOT NULL,
      email TEXT NOT NULL,
      role TEXT NOT NULL CHECK(role IN ('admin','member','viewer')),
      token TEXT UNIQUE NOT NULL,
      expires_at TEXT NOT NULL,
      status TEXT NOT NULL CHECK(status IN ('pending','accepted','expired','revoked')) DEFAULT('pending'),
      invited_by TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT(datetime('now')),
      updated_at TEXT NOT NULL DEFAULT(datetime('now')),
      PRIMARY KEY (workspace_id, email)
    );
    CREATE INDEX IF NOT EXISTS idx_workspace_invitations_token ON workspace_invitations(token);

    CREATE TABLE IF NOT EXISTS project_invitations (
      project_id TEXT NOT NULL,
      email TEXT NOT NULL,
      role TEXT NOT NULL CHECK(role IN ('admin','member','viewer')),
      token TEXT UNIQUE NOT NULL,
      expires_at TEXT NOT NULL,
      status TEXT NOT NULL CHECK(status IN ('pending','accepted','expired','revoked')) DEFAULT('pending'),
      invited_by TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT(datetime('now')),
      updated_at TEXT NOT NULL DEFAULT(datetime('now')),
      PRIMARY KEY (project_id, email)
    );
    CREATE INDEX IF NOT EXISTS idx_project_invitations_token ON project_invitations(token);

    CREATE TABLE IF NOT EXISTS devhub_audit_log (
      audit_id TEXT PRIMARY KEY,
      tool TEXT NOT NULL,
      actor TEXT,
      workspace_id TEXT,
      project_id TEXT,
      status TEXT NOT NULL CHECK(status IN ('ok', 'error')),
      error_code TEXT,
      error_message TEXT,
      metadata TEXT,
      created_at TEXT NOT NULL DEFAULT(datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_audit_log_tool ON devhub_audit_log(tool, created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_audit_log_actor ON devhub_audit_log(actor, created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_audit_log_workspace ON devhub_audit_log(workspace_id, created_at DESC);
  `);

  // Additive ALTER statements for legacy tables that may be missing columns
  // added after initial creation. These run after CREATE TABLE so fresh DBs
  // get the columns from the definition, and before indexes that depend on
  // those columns.
  const alterStatements = [
    "ALTER TABLE projects ADD COLUMN documentation_policy TEXT DEFAULT 'personal'",
    // devhub-cloud-foundation (PR 2): additive — projects needs workspace_id
    // for tenancy. REQ-TEN-1, REQ-TEN-2.
    'ALTER TABLE projects ADD COLUMN workspace_id TEXT',
    'ALTER TABLE tasks ADD COLUMN workspace_id TEXT',
    'ALTER TABLE milestones ADD COLUMN workspace_id TEXT',
    'ALTER TABLE workspace_members ADD COLUMN user_id TEXT',
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
    'ALTER TABLE agent_workspaces ADD COLUMN repo_root TEXT',
    'ALTER TABLE agent_workspaces ADD COLUMN workspace_path TEXT',
    'ALTER TABLE agent_workspaces ADD COLUMN worktree_path TEXT',
    'ALTER TABLE agent_workspaces ADD COLUMN base_branch TEXT',
    'ALTER TABLE agent_workspaces ADD COLUMN base_commit TEXT',
    'ALTER TABLE agent_workspaces ADD COLUMN branch_name TEXT',
    'ALTER TABLE agent_workspaces ADD COLUMN status TEXT',
    'ALTER TABLE agent_workspaces ADD COLUMN observed_branch TEXT',
    'ALTER TABLE agent_workspaces ADD COLUMN observed_head TEXT',
    'ALTER TABLE agent_workspaces ADD COLUMN observed_dirty TEXT',
    'ALTER TABLE agent_workspaces ADD COLUMN last_error TEXT',
    'ALTER TABLE agent_workspaces ADD COLUMN last_error_class TEXT',
    'ALTER TABLE agent_workspaces ADD COLUMN recovery_reason TEXT',
    'ALTER TABLE agent_workspaces ADD COLUMN evidence_ref TEXT',
    'ALTER TABLE agent_workspaces ADD COLUMN run_id_or_session_id TEXT',
    'ALTER TABLE agent_workspaces ADD COLUMN reservation_token TEXT',
    'ALTER TABLE agent_workspaces ADD COLUMN correlation_id TEXT',
    'ALTER TABLE agent_workspaces ADD COLUMN accepted_at TEXT',
    'ALTER TABLE agent_workspaces ADD COLUMN claimed_at TEXT',
    'ALTER TABLE agent_workspaces ADD COLUMN started_at TEXT',
    'ALTER TABLE agent_workspaces ADD COLUMN completed_at TEXT',
    'ALTER TABLE agent_workspaces ADD COLUMN current_task_id TEXT',
    'ALTER TABLE agent_workspaces ADD COLUMN pane_id TEXT',
    'ALTER TABLE agent_workspaces ADD COLUMN terminal_id TEXT',
    'ALTER TABLE agent_workspaces ADD COLUMN opencode_pid INTEGER',
    'ALTER TABLE agent_workspaces ADD COLUMN last_heartbeat TEXT',
    "ALTER TABLE tasks ADD COLUMN tags TEXT DEFAULT '[]'",
    'ALTER TABLE agent_auth_tokens ADD COLUMN secret TEXT',
    'ALTER TABLE task_comments ADD COLUMN user_id TEXT',
    'ALTER TABLE project_members ADD COLUMN invited_email TEXT',
    'ALTER TABLE project_members ADD COLUMN invite_token TEXT',
    'ALTER TABLE project_members ADD COLUMN invited_at TEXT',
    'ALTER TABLE project_members ADD COLUMN accepted_at TEXT',
    'ALTER TABLE project_members ADD COLUMN invited_by TEXT',
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

  // task_comments.user_id and workspace_members.user_id are added via ALTER
  // above for legacy DBs, so their indexes must be created after the ALTER loop.
  db.exec(`CREATE INDEX IF NOT EXISTS idx_task_comments_user ON task_comments(user_id)`);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_workspace_members_user ON workspace_members(user_id)`);

  try {
    db.exec(
      `CREATE INDEX IF NOT EXISTS idx_project_members_invited_email ON project_members(invited_email)`
    );
    db.exec(
      `CREATE INDEX IF NOT EXISTS idx_project_members_invite_token ON project_members(invite_token)`
    );
  } catch (e) {
    if (!e.message.includes('no such column') && !e.message.includes('no such table')) {
      throw e;
    }
  }

  // audit_events table (idempotent)
  db.exec(`
    CREATE TABLE IF NOT EXISTS audit_events (
      id             TEXT PRIMARY KEY,
      event_id       TEXT UNIQUE NOT NULL,
      action_id      TEXT NOT NULL,
      action_class   TEXT NOT NULL,
      actor_role     TEXT NOT NULL,
      actor_session_id TEXT NOT NULL,
      target_type    TEXT,
      target_id      TEXT,
      target_label   TEXT,
      params         TEXT,
      risk_tier      INTEGER,
      confirmed      INTEGER,
      confirmed_at   TEXT,
      rationale      TEXT,
      outcome        TEXT NOT NULL CHECK(outcome IN ('success','denied','error','deferred')),
      error_detail   TEXT,
      devhub_version TEXT,
      received_at    TEXT DEFAULT (datetime('now'))
    );
  `);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_audit_events_outcome ON audit_events(outcome)`);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_audit_events_action ON audit_events(action_id)`);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_audit_events_actor ON audit_events(actor_session_id)`);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_audit_events_received ON audit_events(received_at)`);

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

  rebuildAgentEventsTableIfNeeded(db);

  seedLocalTenancy(db);
}

const MCP_SCHEMA_SQL = `
  CREATE TABLE IF NOT EXISTS tasks (
    id TEXT PRIMARY KEY,
    project_id TEXT NOT NULL,
    workspace_id TEXT,
    user_id TEXT,
    title TEXT NOT NULL,
    description TEXT,
    status TEXT DEFAULT 'pending',
    priority TEXT DEFAULT 'medium',
    due_date TEXT,
    completed_at TEXT,
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now')),
    milestone_id TEXT,
    business_value INTEGER DEFAULT 5,
    stale_alert INTEGER DEFAULT 0,
    retry_count INTEGER DEFAULT 0,
    last_qa_feedback TEXT,
    assigned_to TEXT,
    claimed_at TEXT,
    lease_expires_at TEXT,
    claim_token TEXT
  );

  CREATE TABLE IF NOT EXISTS milestones (
    id TEXT PRIMARY KEY,
    project_id TEXT NOT NULL,
    workspace_id TEXT,
    user_id TEXT,
    title TEXT NOT NULL,
    description TEXT,
    status TEXT DEFAULT 'planned',
    due_date TEXT,
    assigned_to TEXT,
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS task_comments (
    id TEXT PRIMARY KEY,
    task_id TEXT NOT NULL,
    user_id TEXT,
    content TEXT NOT NULL,
    author_type TEXT DEFAULT 'agent',
    created_at TEXT DEFAULT (datetime('now'))
  );
  CREATE INDEX IF NOT EXISTS idx_task_comments_user ON task_comments(user_id);

  CREATE TABLE IF NOT EXISTS task_dependencies (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    task_id TEXT NOT NULL,
    depends_on TEXT NOT NULL,
    tipo TEXT DEFAULT 'blocks',
    created_at TEXT DEFAULT (datetime('now')),
    UNIQUE(task_id, depends_on)
  );

  CREATE TABLE IF NOT EXISTS agent_registry (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    agent_id TEXT NOT NULL UNIQUE,
    project_id TEXT NOT NULL,
    nombre TEXT NOT NULL,
    modelo_llm TEXT,
    status TEXT DEFAULT 'idle',
    current_task_id TEXT,
    last_heartbeat TEXT DEFAULT (datetime('now')),
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now')),
    error_message TEXT
  );

  CREATE TABLE IF NOT EXISTS agent_memory (
    id TEXT PRIMARY KEY,
    project_id TEXT NOT NULL,
    agent_id TEXT,
    key TEXT NOT NULL,
    tipo TEXT NOT NULL,
    value TEXT NOT NULL,
    embedding TEXT,
    created_at TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS agent_runs (
    run_id TEXT PRIMARY KEY,
    workspace_id TEXT NOT NULL,
    task_id TEXT,
    agent_id TEXT NOT NULL,
    requested_base_ref TEXT NOT NULL,
    baseline_commit TEXT NOT NULL,
    observed_start_branch TEXT,
    observed_start_head TEXT,
    observed_start_dirty TEXT,
    observed_start_path TEXT,
    status TEXT NOT NULL DEFAULT 'planned',
    predecessor_run_id TEXT,
    recovery_group_id TEXT,
    terminal_reason_class TEXT,
    started_at TEXT DEFAULT (datetime('now')),
    completed_at TEXT,
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS agent_artifacts (
    artifact_id TEXT PRIMARY KEY,
    run_id TEXT NOT NULL,
    seq INTEGER NOT NULL,
    phase TEXT NOT NULL,
    kind TEXT NOT NULL,
    producer TEXT NOT NULL,
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
    UNIQUE(run_id, seq)
  );

  CREATE INDEX IF NOT EXISTS idx_tasks_project ON tasks(project_id);
  CREATE INDEX IF NOT EXISTS idx_tasks_status ON tasks(status);
  CREATE INDEX IF NOT EXISTS idx_tasks_priority ON tasks(priority);
  CREATE INDEX IF NOT EXISTS idx_tasks_lease_expires ON tasks(lease_expires_at);
  CREATE INDEX IF NOT EXISTS idx_tasks_claim_token ON tasks(claim_token);
  CREATE INDEX IF NOT EXISTS idx_milestones_project ON milestones(project_id);
  CREATE INDEX IF NOT EXISTS idx_task_dependencies_task ON task_dependencies(task_id);
  CREATE INDEX IF NOT EXISTS idx_task_dependencies_depends ON task_dependencies(depends_on);
  CREATE INDEX IF NOT EXISTS idx_agent_registry_project ON agent_registry(project_id);
  CREATE INDEX IF NOT EXISTS idx_agent_registry_status ON agent_registry(status);
  CREATE INDEX IF NOT EXISTS idx_agent_memory_project ON agent_memory(project_id);
  CREATE INDEX IF NOT EXISTS idx_agent_memory_tipo ON agent_memory(tipo);
  CREATE INDEX IF NOT EXISTS idx_task_comments_task ON task_comments(task_id);
  CREATE INDEX IF NOT EXISTS idx_agent_runs_workspace ON agent_runs(workspace_id, created_at DESC);
  CREATE INDEX IF NOT EXISTS idx_agent_runs_task ON agent_runs(task_id, created_at DESC);
  CREATE INDEX IF NOT EXISTS idx_agent_artifacts_run_seq ON agent_artifacts(run_id, seq ASC);

  CREATE TABLE IF NOT EXISTS operator_inbox (
    inbox_id TEXT PRIMARY KEY,
    project_id TEXT NOT NULL,
    actor_id TEXT NOT NULL,
    category TEXT NOT NULL CHECK(category IN ('approval_request','approval_result','supervisor_action','task_claimed','task_released','task_blocked','agent_event','system')),
    source_table TEXT NOT NULL,
    source_id TEXT NOT NULL,
    message TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'unread' CHECK(status IN ('unread','read','dismissed')),
    created_at TEXT NOT NULL DEFAULT(datetime('now')),
    updated_at TEXT NOT NULL DEFAULT(datetime('now'))
  );
  CREATE INDEX IF NOT EXISTS idx_operator_inbox_project ON operator_inbox(project_id);
  CREATE INDEX IF NOT EXISTS idx_operator_inbox_actor ON operator_inbox(actor_id);
  CREATE INDEX IF NOT EXISTS idx_operator_inbox_status ON operator_inbox(status);
  CREATE INDEX IF NOT EXISTS idx_operator_inbox_created ON operator_inbox(created_at DESC);

  CREATE TABLE IF NOT EXISTS task_history (
    history_id INTEGER PRIMARY KEY AUTOINCREMENT,
    task_id TEXT NOT NULL,
    actor_id TEXT,
    action TEXT NOT NULL,
    from_status TEXT,
    to_status TEXT,
    metadata TEXT,
    created_at TEXT NOT NULL DEFAULT(datetime('now')),
    FOREIGN KEY(task_id) REFERENCES tasks(id)
  );
  CREATE INDEX IF NOT EXISTS idx_task_history_task ON task_history(task_id);
  CREATE INDEX IF NOT EXISTS idx_task_history_created ON task_history(created_at DESC);
  CREATE INDEX IF NOT EXISTS idx_task_history_action ON task_history(action);
`;

const MCP_ALTER_STATEMENTS = [
  'ALTER TABLE agent_workspaces ADD COLUMN repo_root TEXT',
  'ALTER TABLE agent_workspaces ADD COLUMN workspace_path TEXT',
  'ALTER TABLE agent_workspaces ADD COLUMN worktree_path TEXT',
  'ALTER TABLE agent_workspaces ADD COLUMN base_branch TEXT',
  'ALTER TABLE agent_workspaces ADD COLUMN base_commit TEXT',
  'ALTER TABLE agent_workspaces ADD COLUMN branch_name TEXT',
  'ALTER TABLE agent_workspaces ADD COLUMN status TEXT',
  'ALTER TABLE agent_workspaces ADD COLUMN observed_branch TEXT',
  'ALTER TABLE agent_workspaces ADD COLUMN observed_head TEXT',
  'ALTER TABLE agent_workspaces ADD COLUMN observed_dirty TEXT',
  'ALTER TABLE agent_workspaces ADD COLUMN last_error TEXT',
  'ALTER TABLE agent_workspaces ADD COLUMN last_error_class TEXT',
  'ALTER TABLE agent_workspaces ADD COLUMN recovery_reason TEXT',
  'ALTER TABLE agent_workspaces ADD COLUMN evidence_ref TEXT',
  'ALTER TABLE agent_workspaces ADD COLUMN run_id_or_session_id TEXT',
  'ALTER TABLE agent_workspaces ADD COLUMN reservation_token TEXT',
  'ALTER TABLE agent_workspaces ADD COLUMN correlation_id TEXT',
  'ALTER TABLE agent_workspaces ADD COLUMN accepted_at TEXT',
  'ALTER TABLE agent_workspaces ADD COLUMN claimed_at TEXT',
  'ALTER TABLE agent_workspaces ADD COLUMN started_at TEXT',
  'ALTER TABLE agent_workspaces ADD COLUMN completed_at TEXT',
  'ALTER TABLE agent_workspaces ADD COLUMN current_task_id TEXT',
  'ALTER TABLE agent_workspaces ADD COLUMN pane_id TEXT',
  'ALTER TABLE agent_workspaces ADD COLUMN terminal_id TEXT',
  'ALTER TABLE agent_workspaces ADD COLUMN opencode_pid INTEGER',
  'ALTER TABLE agent_workspaces ADD COLUMN last_heartbeat TEXT',
  'ALTER TABLE tasks ADD COLUMN milestone_id TEXT',
  'ALTER TABLE tasks ADD COLUMN business_value INTEGER DEFAULT 5',
  'ALTER TABLE tasks ADD COLUMN stale_alert INTEGER DEFAULT 0',
  'ALTER TABLE tasks ADD COLUMN retry_count INTEGER DEFAULT 0',
  'ALTER TABLE tasks ADD COLUMN last_qa_feedback TEXT',
  'ALTER TABLE tasks ADD COLUMN assigned_to TEXT',
  'ALTER TABLE tasks ADD COLUMN claimed_at TEXT',
  'ALTER TABLE tasks ADD COLUMN lease_expires_at TEXT',
  'ALTER TABLE tasks ADD COLUMN claim_token TEXT',
  'ALTER TABLE milestones ADD COLUMN assigned_to TEXT',
  'ALTER TABLE agent_registry ADD COLUMN current_task_id TEXT',
  'ALTER TABLE agent_registry ADD COLUMN updated_at TEXT',
  'ALTER TABLE agent_registry ADD COLUMN error_message TEXT',
  "ALTER TABLE tasks ADD COLUMN tags TEXT DEFAULT '[]'",
  'ALTER TABLE task_comments ADD COLUMN user_id TEXT',
];

function ensureAllSchema(db) {
  ensureRuntimeSchema(db);
  // Apply additive ALTER statements first. Legacy tables may be missing
  // columns (e.g. task_comments.user_id) and MCP_SCHEMA_SQL creates indexes
  // on those columns; running ALTERs first avoids "no such column" errors.
  for (const stmt of MCP_ALTER_STATEMENTS) {
    try {
      db.exec(stmt);
    } catch (e) {
      if (!e.message.includes('duplicate column name') && !e.message.includes('no such table')) {
        throw e;
      }
    }
  }
  db.exec(MCP_SCHEMA_SQL);
  // T-001 — agent comms bus migration (idempotent; safe to call on every boot).
  // Lazy require to avoid circular dep with localDb.js.
  const { ensureAgentCommsBusSchema, applyPragmasForBus } = require('./busMigrations.js');
  ensureAgentCommsBusSchema(db);
  applyPragmasForBus(db);

  // Backfill workspace_id for legacy rows in local SQLite (cloud uses Supabase migrations).
  try {
    db.exec("UPDATE projects SET workspace_id = 'local-ws' WHERE workspace_id IS NULL");
    db.exec("UPDATE tasks SET workspace_id = 'local-ws' WHERE workspace_id IS NULL");
    db.exec("UPDATE milestones SET workspace_id = 'local-ws' WHERE workspace_id IS NULL");
  } catch {
    /* ignore on fresh DB until tables exist */
  }
}

module.exports = {
  ensureRuntimeSchema,
  ensureAllSchema,
};
