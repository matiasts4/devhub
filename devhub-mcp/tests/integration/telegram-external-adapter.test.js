import { describe, it, expect, beforeAll, afterAll } from '@jest/globals';
import { createRequire } from 'module';
import { createTestHarness } from '../test-harness.js';

const require = createRequire(import.meta.url);
const Database = require('better-sqlite3');

function openDb(harness) {
  return new Database(harness.dbPath);
}

function seedAllowlistedActor(harness, overrides = {}) {
  const db = openDb(harness);
  try {
    db.prepare(
      `INSERT INTO telegram_actor_mappings (
        actor_id,
        telegram_user_id,
        telegram_chat_id,
        devhub_actor_id,
        display_name,
        allowlisted,
        created_at,
        updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      overrides.actor_id || 'telegram:user-1',
      overrides.telegram_user_id || 'user-1',
      overrides.telegram_chat_id || 'chat-1',
      overrides.devhub_actor_id || 'human-1',
      overrides.display_name || 'Matias',
      1,
      overrides.created_at || '2026-05-19T10:00:00.000Z',
      overrides.updated_at || '2026-05-19T10:00:00.000Z'
    );
  } finally {
    db.close();
  }
}

function legacyTaskId() {
  return 'task-1716111111111-adapter1';
}

describe('Telegram external adapter MCP helpers', () => {
  let harness;

  beforeAll(async () => {
    harness = await createTestHarness();
    await harness.initialize();
  });

  afterAll(async () => {
    await harness.cleanup();
  });

  it('records bounded telegram intents and replays duplicate envelopes idempotently', async () => {
    seedAllowlistedActor(harness);

    const first = await harness.callTool('record_telegram_adapter_intent', {
      actor_id: 'telegram:user-1',
      chat_id: 'chat-1',
      message_id: '10',
      update_id: '20',
      action: 'task.detail',
      target_ref: { task_id: legacyTaskId() },
    });
    const replay = await harness.callTool('record_telegram_adapter_intent', {
      actor_id: 'telegram:user-1',
      chat_id: 'chat-1',
      message_id: '10',
      update_id: '20',
      action: 'task.detail',
      target_ref: { task_id: legacyTaskId() },
    });

    expect(first).toMatchObject({
      accepted: true,
      replayed: false,
      intent: {
        action: 'task.detail',
        task_id: legacyTaskId(),
        status: 'accepted',
      },
    });
    expect(replay).toMatchObject({
      accepted: true,
      replayed: true,
    });
    expect(replay.intent.intent_id).toBe(first.intent.intent_id);
  });

  it('rejects forbidden orchestration verbs at the MCP adapter boundary', async () => {
    seedAllowlistedActor(harness, { actor_id: 'telegram:user-2', telegram_user_id: 'user-2' });

    const result = await harness.callTool('record_telegram_adapter_intent', {
      actor_id: 'telegram:user-2',
      chat_id: 'chat-1',
      message_id: '11',
      update_id: '21',
      action: 'git.checkout',
      requested_verb: '/spawn task/sw-7-1a',
    });

    expect(result.raw).toContain('Telegram adapter action out of scope');
    expect(result.raw).toContain('git.checkout');
  });

  it('returns shared snapshot data plus approval, delivery, and subscription writes', async () => {
    seedAllowlistedActor(harness, { actor_id: 'telegram:user-3', telegram_user_id: 'user-3' });

    const project = await harness.callTool('create_project', {
      name: `Telegram MCP ${Date.now()}`,
    });
    const task = await harness.callTool('create_task', {
      project_id: project.project.id,
      user_id: '54fee7d7-340d-4683-b259-b61a39567f94',
      title: 'Telegram adapter snapshot candidate',
    });
    const workspace = await harness.callTool('create_agent_workspace', {
      workspace_id: 'ws-telegram-adapter-1',
      project_id: project.project.id,
      agent_id: 'agent-telegram-adapter-1',
      current_task_id: task.task.id,
      run_id_or_session_id: 'session-telegram-adapter-1',
      repo_root: '/repo/devhub',
      workspace_path: 'workspace://devhub/ws-telegram-adapter-1',
      base_branch: 'main',
      status: 'cleanup_pending',
      observed_dirty: 'dirty-excluded',
    });
    const run = await harness.callTool('create_agent_run', {
      run_id: 'run-telegram-adapter-1',
      workspace_id: workspace.workspace.id,
      task_id: task.task.id,
      agent_id: 'agent-telegram-adapter-1',
      requested_base_ref: '5a3ff5be5457b2d1d6907fee030e131bf51c52d0',
      baseline_commit: '5a3ff5be5457b2d1d6907fee030e131bf51c52d0',
      observed_start_dirty: 'dirty-excluded',
      status: 'running',
    });
    await harness.callTool('append_agent_artifact', {
      run_id: run.run.run_id,
      phase: 'qa',
      kind: 'qa.result',
      producer: 'qa',
      summary: 'QA evidence ready',
      evidence_ref: 'artifact://run-telegram-adapter-1/qa/1',
    });
    const approval = await harness.callTool('request_supervisor_approval', {
      task_id: task.task.id,
      workspace_id: workspace.workspace.id,
      run_id: run.run.run_id,
      reason_class: 'approval_required',
      evidence_ref: 'artifact://run-telegram-adapter-1/qa/1',
    });

    const delivery = await harness.callTool('record_telegram_delivery', {
      telegram_chat_id: 'chat-1',
      task_id: task.task.id,
      workspace_id: workspace.workspace.id,
      run_id: run.run.run_id,
      status: 'retry_pending',
      attempts_count: 2,
      last_error: 'telegram timeout',
    });
    const subscription = await harness.callTool('set_telegram_subscription', {
      actor_id: 'telegram:user-3',
      telegram_chat_id: 'chat-1',
      task_id: task.task.id,
      workspace_id: workspace.workspace.id,
      run_id: run.run.run_id,
      status: 'mute',
    });
    const approvalResponse = await harness.callTool('respond_telegram_approval', {
      actor_id: 'telegram:user-3',
      chat_id: 'chat-1',
      approval_id: approval.checkpoint.checkpoint_key,
      decision: 'approve',
      message_id: '12',
      update_id: '22',
    });
    const snapshot = await harness.callTool('get_telegram_channel_snapshot', {
      task_id: task.task.id,
    });

    expect(delivery.delivery).toMatchObject({
      task_id: task.task.id,
      status: 'retry_pending',
      attempts_count: 2,
    });
    expect(subscription.subscription).toMatchObject({
      actor_id: 'telegram:user-3',
      telegram_chat_id: 'chat-1',
      status: 'mute',
    });
    expect(approvalResponse).toMatchObject({
      accepted: true,
      checkpoint: {
        checkpoint_key: approval.checkpoint.checkpoint_key,
        status: 'approved',
      },
      intent: {
        action: 'approval.respond',
        approval_id: approval.checkpoint.checkpoint_key,
      },
    });
    expect(snapshot.snapshot).toMatchObject({
      task_id: task.task.id,
      workspace_id: workspace.workspace.id,
      run_id: run.run.run_id,
      workspace_status: 'cleanup_pending',
      run_status: 'running',
      approval: {
        id: approval.checkpoint.checkpoint_key,
        status: 'approved',
      },
      delivery: {
        last_status: 'retry_pending',
        attempts_count: 2,
      },
      latest_artifact_kind: 'qa.result',
      latest_artifact_evidence_ref: 'artifact://run-telegram-adapter-1/qa/1',
      degraded: false,
    });
  });
});
