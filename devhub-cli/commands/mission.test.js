'use strict';

const Database = require('better-sqlite3');

const { ensureAllSchema } = require('../../src/lib/db/schema');
const { createTempDb, cleanupDb, CLI } = require('../tests/fixtures/seed-factory');

let dbPath;

function runCli(args, opts = {}) {
  const { spawnSync } = require('child_process');
  return spawnSync('node', [CLI, ...args], {
    encoding: 'utf8',
    env: { ...process.env, DEVHUB_DB_PATH: dbPath, NODE_ENV: 'test', ...(opts.env || {}) },
  });
}

function seedMission(mission = {}) {
  const db = new Database(dbPath);
  try {
    ensureAllSchema(db);

    db.prepare(
      `INSERT OR REPLACE INTO projects (id, user_id, name, status, created_at, updated_at)
       VALUES (?, 'user-1', ?, 'active', datetime('now'), datetime('now'))`
    ).run(mission.project_id || 'proj-mission', 'Mission Project');

    db.prepare(
      `INSERT OR REPLACE INTO agent_registry (agent_id, project_id, nombre, status)
       VALUES (?, ?, ?, 'idle')`
    ).run(
      mission.owner_agent_id || 'agent-mission-owner',
      mission.project_id || 'proj-mission',
      'Mission Owner'
    );

    db.prepare(
      `INSERT OR REPLACE INTO swarm_missions (
        mission_id, project_id, owner_agent_id, kind, title,
        status, summary, started_at, updated_at, run_id
      ) VALUES (?, ?, ?, 'coordination', ?, ?, ?, ?, ?, ?)`
    ).run(
      mission.mission_id || 'mission-1',
      mission.project_id || 'proj-mission',
      mission.owner_agent_id || 'agent-mission-owner',
      mission.title || 'Mission Test Title',
      mission.status || 'active',
      mission.summary || 'Test mission',
      mission.started_at || '2026-05-25T10:00:00Z',
      mission.updated_at || '2026-05-25T10:00:00Z',
      mission.run_id || null
    );
  } finally {
    db.close();
  }
}

function seedMissionDiagnostic() {
  const db = new Database(dbPath);
  try {
    ensureAllSchema(db);

    db.prepare(
      `INSERT OR REPLACE INTO projects (id, user_id, name, status, created_at, updated_at)
       VALUES ('proj-diagnostic', 'user-1', 'Diagnostic Project', 'active', datetime('now'), datetime('now'))`
    ).run();

    db.prepare(
      `INSERT OR REPLACE INTO swarm_missions (
        mission_id, project_id, task_id, owner_agent_id, kind, title, status, summary, started_at, updated_at
      ) VALUES (?, 'proj-diagnostic', 'task-diagnostic', 'agent-mission-owner', 'coordination', ?, 'active', ?, ?, ?)`
    ).run(
      'mission-diagnostic',
      'Mission Diagnostic',
      'Diagnostic mission',
      '2026-05-25T10:00:00Z',
      '2026-05-25T10:00:00Z'
    );

    db.prepare(
      `INSERT OR REPLACE INTO mission_participants (
        participant_id, mission_id, agent_id, role_in_mission, status, joined_at, created_at, updated_at
      ) VALUES (?, 'mission-diagnostic', 'agent-worker-stale', 'executor', 'active', datetime('now'), datetime('now'), datetime('now'))`
    ).run('participant-stale');

    db.prepare(
      `INSERT OR REPLACE INTO agent_workspaces (
        id, project_id, agent_id, current_task_id, run_id_or_session_id, repo_root, workspace_path,
        worktree_path, base_branch, base_commit, branch_name, observed_branch, observed_head, status
      ) VALUES (?, 'proj-diagnostic', 'agent-worker-stale', 'task-diagnostic', 'session-stale', '/repo/devhub',
        'workspace://proj-diagnostic/ws-stale', '/repo/devhub/.devhub/worktrees/ws-stale', 'main', 'HEAD',
        'feat/ws-stale', 'feat/ws-stale', 'abc123', 'active')`
    ).run('ws-stale');

    db.prepare(
      `INSERT OR REPLACE INTO agent_runs (
        run_id, workspace_id, task_id, agent_id, requested_base_ref, baseline_commit, status, started_at, created_at, updated_at
      ) VALUES (?, 'ws-stale', 'task-diagnostic', 'agent-worker-stale', 'HEAD', 'HEAD', 'running',
        datetime('now'), datetime('now'), datetime('now'))`
    ).run('run-stale');

    db.prepare(
      `INSERT OR REPLACE INTO agent_hub_sessions (
        id, project_id, title, agent_model, status, visibility, opencode_session_id, directory, created_at, updated_at
      ) VALUES (?, 'proj-diagnostic', 'Worker Stale Session', 'opencode', 'active', 'visible', NULL,
        '/repo/devhub/.devhub/worktrees/ws-stale', datetime('now'), datetime('now'))`
    ).run('session-stale');

    db.prepare(
      `INSERT OR REPLACE INTO agent_presence (
        presence_id, mission_id, agent_id, workspace_id, run_id, runtime_surface, presence_state,
        status_summary, last_seen_at, expires_at, created_at, updated_at
      ) VALUES (?, 'mission-diagnostic', 'agent-worker-stale', 'ws-stale', 'run-stale', 'swarm-control-launch',
        'busy', 'Busy', datetime('now'), datetime('now', '+2 minute'), datetime('now'), datetime('now'))`
    ).run('presence-stale');
  } finally {
    db.close();
  }
}

function seedMissionDirectorFeed() {
  const db = new Database(dbPath);
  try {
    ensureAllSchema(db);

    db.prepare(
      `INSERT OR REPLACE INTO projects (id, user_id, name, status, created_at, updated_at)
       VALUES ('proj-feed', 'user-1', 'Feed Project', 'active', datetime('now'), datetime('now'))`
    ).run();

    db.prepare(
      `INSERT OR REPLACE INTO tasks (id, project_id, title, status, priority, created_at, updated_at)
       VALUES ('task-feed', 'proj-feed', 'Feed Task', 'in_progress', 'high', datetime('now'), datetime('now'))`
    ).run();

    db.prepare(
      `INSERT OR REPLACE INTO agent_workspaces (
        id, project_id, agent_id, current_task_id, run_id_or_session_id, repo_root, workspace_path,
        worktree_path, base_branch, base_commit, branch_name, observed_branch, observed_head, status, created_at, updated_at
      ) VALUES (
        'ws-feed', 'proj-feed', 'agent-worker-feed', 'task-feed', 'session-feed', '/repo/devhub',
        'workspace://proj-feed/ws-feed', '/repo/devhub/.devhub/worktrees/ws-feed', 'main', 'HEAD',
        'feat/feed', 'feat/feed', 'abc123', 'active', datetime('now'), datetime('now')
      )`
    ).run();

    db.prepare(
      `INSERT OR REPLACE INTO agent_runs (
        run_id, workspace_id, task_id, agent_id, requested_base_ref, baseline_commit, status, started_at, created_at, updated_at
      ) VALUES (
        'run-feed', 'ws-feed', 'task-feed', 'agent-worker-feed', 'HEAD', 'HEAD', 'running',
        datetime('now'), datetime('now'), datetime('now')
      )`
    ).run();

    db.prepare(
      `INSERT OR REPLACE INTO swarm_missions (
        mission_id, project_id, task_id, workspace_id, run_id, owner_agent_id, kind, title, status, summary, started_at, updated_at
      ) VALUES (?, 'proj-feed', 'task-feed', 'ws-feed', 'run-feed', 'agent-director-feed', 'coordination', ?, 'active', ?, ?, ?)`
    ).run(
      'mission-feed',
      'Mission Feed',
      'Mission feed summary',
      '2026-05-26T21:00:00Z',
      '2026-05-26T21:00:00Z'
    );

    db.prepare(
      `INSERT OR REPLACE INTO agent_artifacts (
        artifact_id, run_id, seq, phase, kind, producer, summary, evidence_ref, observed_at, created_at
      ) VALUES (
        'artifact-feed', 'run-feed', 1, 'execute', 'decision.note', 'executor', 'Feed artifact',
        'evidence://artifact/feed', '2026-05-26T21:01:00Z', datetime('now')
      )`
    ).run();

    db.prepare(
      `INSERT OR REPLACE INTO supervisor_snapshots (
        task_id, supervisor_state, outcome, reason_class, workspace_id, run_id, evidence_ref, updated_at, created_at
      ) VALUES (
        'task-feed', 'awaiting_evidence', 'wait', 'recoverable_failure', 'ws-feed', 'run-feed',
        'evidence://supervisor/feed', '2026-05-26T21:01:00Z', '2026-05-26T21:01:00Z'
      )`
    ).run();

    db.prepare(
      `INSERT OR REPLACE INTO mission_messages (
        message_id, mission_id, sender_agent_id, message_kind, body_summary, evidence_ref,
        related_task_id, related_workspace_id, related_run_id, related_artifact_id,
        created_at, updated_at
      ) VALUES (
        'message-feed-handoff', 'mission-feed', 'agent-worker-feed', 'handoff', 'Executor handoff ready',
        'evidence://mission/feed-handoff', 'task-feed', 'ws-feed', 'run-feed', 'artifact-feed',
        '2026-05-26T21:01:00Z', '2026-05-26T21:01:00Z'
      )`
    ).run();

    db.prepare(
      `INSERT OR REPLACE INTO message_deliveries (
        delivery_id, message_id, recipient_agent_id, channel, status, last_attempt_at, created_at, updated_at
      ) VALUES (
        'delivery-feed-handoff', 'message-feed-handoff', 'agent-director-feed', 'runtime_bus', 'pending',
        '2026-05-26T21:01:10Z', '2026-05-26T21:01:10Z', '2026-05-26T21:01:10Z'
      )`
    ).run();

    db.prepare(
      `INSERT INTO agent_events (
        agent_id, workspace_id, event_type, payload_json, mission_id, created_at
      ) VALUES (
        'agent-worker-feed', 'ws-feed', 'handoff_ready', ?, 'mission-feed', '2026-05-26T21:01:00Z'
      )`
    ).run(
      JSON.stringify({
        related_task_id: 'task-feed',
        related_workspace_id: 'ws-feed',
        related_run_id: 'run-feed',
        related_artifact_id: 'artifact-feed',
        summary: 'Executor handoff ready',
        next_action: 'director_review',
      })
    );
  } finally {
    db.close();
  }
}

describe('mission.js', () => {
  beforeEach(() => {
    dbPath = createTempDb();
  });

  afterEach(() => {
    cleanupDb(dbPath);
  });

  it('should export mission command', () => {
    const missionCommand = require('./mission');
    expect(typeof missionCommand).toBe('function');
  });

  it('defaults close outcome to aborted so CLI happy path is valid', () => {
    seedMission({ mission_id: 'mission-abort-default' });

    const result = runCli(['mission', 'close', 'mission-abort-default', '--json']);

    expect(result.status).toBe(0);
    const parsed = JSON.parse(result.stdout);
    expect(parsed.success).toBe(true);
    expect(parsed.outcome).toBe('aborted');
  });

  it('rejects completed close without evidence before calling backend close', () => {
    seedMission({ mission_id: 'mission-needs-evidence' });

    const result = runCli(['mission', 'close', 'mission-needs-evidence', '--outcome', 'completed']);

    expect(result.status).toBe(1);
    expect(result.stderr).toMatch(/requires at least one --check or --commit/);
  });

  it('passes completed evidence through to missionClose', () => {
    seedMission({ mission_id: 'mission-completed' });

    const result = runCli([
      'mission',
      'close',
      'mission-completed',
      '--outcome',
      'completed',
      '--check',
      'jest:pass',
      '--commit',
      'abc1234',
      '--json',
    ]);

    expect(result.status).toBe(0);
    const parsed = JSON.parse(result.stdout);
    expect(parsed.success).toBe(true);
    expect(parsed.outcome).toBe('completed');
  });

  it('reports canonical participant diagnosis for mission status json output', () => {
    seedMissionDiagnostic();

    const result = runCli(['mission', 'status', 'mission-diagnostic', '--json']);

    expect(result.status).toBe(0);
    const parsed = JSON.parse(result.stdout);
    expect(parsed).toEqual(
      expect.objectContaining({
        mission: expect.objectContaining({ mission_id: 'mission-diagnostic' }),
        participants: expect.arrayContaining([
          expect.objectContaining({
            agent_id: 'agent-worker-stale',
            binding: expect.objectContaining({ classification: 'stale', reason: 'binding_stale' }),
            presence: expect.objectContaining({ effective_state: 'busy' }),
          }),
        ]),
      })
    );
  });

  it('returns not found for an unknown mission without emitting partial diagnosis json', () => {
    const result = runCli(['mission', 'status', 'mission-unknown', '--json']);

    expect(result.status).toBe(1);
    expect(result.stderr).toMatch(/Mission not found/);
    expect(result.stdout.trim()).toBe('');
  });

  it('prints the shared director_feed contract in mission status json output', () => {
    seedMissionDirectorFeed();

    const result = runCli(['mission', 'status', 'mission-feed', '--json']);

    expect(result.status).toBe(0);
    const parsed = JSON.parse(result.stdout);
    expect(parsed).toEqual(
      expect.objectContaining({
        director_feed: expect.objectContaining({
          authority: 'durable',
          items: [
            expect.objectContaining({
              kind: 'handoff_ready',
              summary: 'Executor handoff ready',
              next_action: 'director_review',
              task_id: 'task-feed',
            }),
          ],
          handoff: expect.objectContaining({
            status: 'ready',
            recipient_agent_id: 'agent-worker-feed',
            message: 'Executor handoff ready',
          }),
        }),
      })
    );
  });
});
