const Database = require('better-sqlite3');
const {
  ensureRuntimeSchema,
  upsertTelegramActorMapping,
  getTelegramActorMappingByTelegramUser,
  recordTelegramIntentEnvelope,
  getTelegramIntentByIdempotencyKey,
  upsertTelegramDeliveryReceipt,
  getLatestTelegramChannelSnapshot,
} = require('../../src/lib/db/localDb');

function insertWorkspace(db, overrides = {}) {
  const row = {
    id: overrides.id || 'ws-telegram-1',
    project_id: overrides.project_id || 'project-1',
    agent_id: overrides.agent_id || 'agent-1',
    current_task_id: overrides.current_task_id || 'task-telegram-1',
    run_id_or_session_id: overrides.run_id_or_session_id || null,
    repo_root: '/repo/devhub',
    workspace_path: overrides.workspace_path || 'workspace://project-1/ws-telegram-1',
    worktree_path: overrides.worktree_path ?? '.worktrees/ws-telegram-1',
    base_branch: 'main',
    base_commit: 'f814998dd05cb491caf8637bf570dbd74b539090',
    branch_name: overrides.branch_name ?? 'agent/telegram/task-telegram-1',
    status: overrides.status || 'ready',
    observed_branch: overrides.observed_branch ?? 'agent/telegram/task-telegram-1',
    observed_head: overrides.observed_head ?? 'head-telegram-1',
    observed_dirty: overrides.observed_dirty ?? 'clean',
    last_error: null,
    last_error_class: null,
    recovery_reason: null,
    evidence_ref: overrides.evidence_ref || 'evidence://workspace-telegram-1',
    reservation_token: null,
    correlation_id: null,
    accepted_at: null,
    claimed_at: null,
    started_at: null,
    updated_at: overrides.updated_at || '2026-05-19T01:00:00.000Z',
    completed_at: null,
  };

  const keys = Object.keys(row);
  db.prepare(
    `INSERT INTO agent_workspaces (${keys.join(', ')}) VALUES (${keys.map(() => '?').join(', ')})`
  ).run(...keys.map((key) => row[key]));
}

function insertRun(db, overrides = {}) {
  db.prepare(
    `INSERT INTO agent_runs (
      run_id,
      workspace_id,
      task_id,
      agent_id,
      requested_base_ref,
      baseline_commit,
      status,
      terminal_reason_class,
      started_at,
      created_at,
      updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    overrides.run_id || 'run-telegram-1',
    overrides.workspace_id || 'ws-telegram-1',
    overrides.task_id || 'task-telegram-1',
    overrides.agent_id || 'agent-1',
    'f814998dd05cb491caf8637bf570dbd74b539090',
    'f814998dd05cb491caf8637bf570dbd74b539090',
    overrides.status || 'running',
    overrides.terminal_reason_class || null,
    '2026-05-19T01:01:00.000Z',
    '2026-05-19T01:01:00.000Z',
    '2026-05-19T01:01:00.000Z'
  );
}

function insertArtifact(db, overrides = {}) {
  db.prepare(
    `INSERT INTO agent_artifacts (
      artifact_id,
      run_id,
      seq,
      phase,
      kind,
      producer,
      summary,
      evidence_ref,
      evidence_kind,
      evidence_locator,
      observed_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    overrides.artifact_id || 'artifact-telegram-1',
    overrides.run_id || 'run-telegram-1',
    overrides.seq || 1,
    overrides.phase || 'qa',
    overrides.kind || 'qa.result',
    overrides.producer || 'qa',
    overrides.summary || 'Telegram adapter status evidence',
    overrides.evidence_ref || 'artifact://run-telegram-1/qa/1',
    overrides.evidence_kind || 'qa.result',
    overrides.evidence_locator || 'artifact://run-telegram-1/qa/1',
    overrides.observed_at || '2026-05-19T01:02:00.000Z'
  );
}

describe('localDb telegram adapter contracts', () => {
  let db;

  beforeEach(() => {
    db = new Database(':memory:');
    ensureRuntimeSchema(db);
  });

  afterEach(() => {
    db.close();
  });

  test('persists allowlisted actor mappings and deduplicates intent envelopes by idempotency key', () => {
    const actor = upsertTelegramActorMapping(db, {
      telegram_user_id: 'user-123',
      telegram_chat_id: 'chat-123',
      devhub_actor_id: 'human-1',
      display_name: 'Matias',
      allowlisted: true,
    });

    const firstIntent = recordTelegramIntentEnvelope(db, {
      actor_id: actor.actor_id,
      chat_id: 'chat-123',
      message_id: '11',
      update_id: '99',
      action: 'task.detail',
      target_ref: { task_id: 'task-telegram-1' },
      payload: { source: 'telegram-test' },
    });
    const replay = recordTelegramIntentEnvelope(db, {
      actor_id: actor.actor_id,
      chat_id: 'chat-123',
      message_id: '11',
      update_id: '99',
      action: 'task.detail',
      target_ref: { task_id: 'task-telegram-1' },
      payload: { source: 'telegram-test' },
    });

    expect(getTelegramActorMappingByTelegramUser(db, 'user-123')).toMatchObject({
      actor_id: actor.actor_id,
      telegram_chat_id: 'chat-123',
      devhub_actor_id: 'human-1',
      allowlisted: 1,
    });
    expect(firstIntent.idempotency_key).toBe(
      'telegram:99:telegram:user-123:task.detail:task-telegram-1:-:-:-'
    );
    expect(replay.intent_id).toBe(firstIntent.intent_id);
    expect(replay.replayed).toBe(true);
    expect(getTelegramIntentByIdempotencyKey(db, firstIntent.idempotency_key)).toMatchObject({
      intent_id: firstIntent.intent_id,
      action: 'task.detail',
      task_id: 'task-telegram-1',
    });
  });

  test('assembles channel supervisor snapshots from durable supervisor, approval, artifact, and delivery truth', () => {
    insertWorkspace(db);
    insertRun(db);
    insertArtifact(db, { seq: 2, evidence_ref: 'artifact://run-telegram-1/qa/2' });

    db.prepare(
      `INSERT INTO supervisor_approval_checkpoints (
        checkpoint_key,
        task_id,
        workspace_id,
        run_id,
        reason_class,
        evidence_ref,
        status,
        requested_at,
        created_at,
        updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      'task-telegram-1|ws-telegram-1|run-telegram-1|approval_required|artifact://run-telegram-1/qa/2',
      'task-telegram-1',
      'ws-telegram-1',
      'run-telegram-1',
      'approval_required',
      'artifact://run-telegram-1/qa/2',
      'pending',
      '2026-05-19T01:02:30.000Z',
      '2026-05-19T01:02:30.000Z',
      '2026-05-19T01:02:30.000Z'
    );

    db.prepare(
      `INSERT INTO supervisor_snapshots (
        task_id,
        supervisor_state,
        outcome,
        workspace_id,
        run_id,
        evidence_ref,
        approval_checkpoint_key,
        updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      'task-telegram-1',
      'awaiting_approval',
      'request_approval',
      'ws-telegram-1',
      'run-telegram-1',
      'artifact://run-telegram-1/qa/2',
      'task-telegram-1|ws-telegram-1|run-telegram-1|approval_required|artifact://run-telegram-1/qa/2',
      '2026-05-19T01:03:00.000Z'
    );

    upsertTelegramDeliveryReceipt(db, {
      task_id: 'task-telegram-1',
      workspace_id: 'ws-telegram-1',
      run_id: 'run-telegram-1',
      telegram_chat_id: 'chat-123',
      status: 'retry_pending',
      attempts_count: 2,
      last_error: 'telegram timeout',
      last_attempt_at: '2026-05-19T01:04:00.000Z',
    });

    expect(getLatestTelegramChannelSnapshot(db)).toMatchObject({
      task_id: 'task-telegram-1',
      supervisor_state: 'awaiting_approval',
      outcome: 'request_approval',
      workspace_id: 'ws-telegram-1',
      run_id: 'run-telegram-1',
      workspace_status: 'ready',
      run_status: 'running',
      latest_artifact_kind: 'qa.result',
      latest_artifact_evidence_ref: 'artifact://run-telegram-1/qa/2',
      artifact_count: 1,
      approval: {
        id: 'task-telegram-1|ws-telegram-1|run-telegram-1|approval_required|artifact://run-telegram-1/qa/2',
        status: 'pending',
      },
      delivery: {
        last_status: 'retry_pending',
        attempts_count: 2,
        last_error: 'telegram timeout',
      },
      degraded: false,
    });
  });
});
