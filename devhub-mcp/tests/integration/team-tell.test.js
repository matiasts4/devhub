import { describe, it, expect, beforeAll, beforeEach, afterAll } from '@jest/globals';
import { createRequire } from 'module';
import { existsSync, readFileSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { createTestHarness } from '../test-harness.js';

const require = createRequire(import.meta.url);
const Database = require('better-sqlite3');
const {
  createSwarmMission,
  registerMissionParticipant,
} = require('../../../src/lib/db/localDb.js');
const transportLogPath = join(
  tmpdir(),
  `devhub-team-tell-transport-${process.pid}-${Date.now()}-${Math.random().toString(36).slice(2)}.log`
);

function openDb(harness) {
  return new Database(harness.dbPath);
}

function insertWorkspace(db, overrides = {}) {
  const row = {
    id: overrides.id,
    project_id: overrides.project_id,
    agent_id: overrides.agent_id,
    current_task_id: overrides.current_task_id || null,
    run_id_or_session_id: overrides.run_id_or_session_id || null,
    repo_root: overrides.repo_root || '/repo/devhub',
    workspace_path:
      overrides.workspace_path || `workspace://${overrides.project_id}/${overrides.id}`,
    worktree_path: overrides.worktree_path || `.worktrees/${overrides.id}`,
    base_branch: 'main',
    base_commit: 'f814998dd05cb491caf8637bf570dbd74b539090',
    branch_name: overrides.branch_name || `agent/${overrides.agent_id}/${overrides.id}`,
    status: overrides.status || 'ready',
    observed_branch: overrides.observed_branch || `agent/${overrides.agent_id}/${overrides.id}`,
    observed_head: overrides.observed_head || `${overrides.id}-head`,
    observed_dirty: overrides.observed_dirty || 'clean',
    last_error: null,
    last_error_class: null,
    recovery_reason: null,
    evidence_ref: null,
    reservation_token: null,
    correlation_id: null,
    accepted_at: null,
    claimed_at: null,
    started_at: null,
    updated_at: overrides.updated_at || '2026-05-20T17:00:00.000Z',
    completed_at: null,
  };
  const keys = Object.keys(row);
  db.prepare(
    `INSERT INTO agent_workspaces (${keys.join(', ')}) VALUES (${keys.map(() => '?').join(', ')})`
  ).run(...keys.map((key) => row[key]));
}

function insertSession(db, overrides = {}) {
  db.prepare(
    `INSERT INTO agent_hub_sessions (
      id, project_id, title, agent_model, status, visibility, opencode_session_id, directory, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    overrides.id,
    overrides.project_id,
    overrides.title || `Session ${overrides.id}`,
    overrides.agent_model || 'gpt-5.4',
    overrides.status || 'active',
    overrides.visibility || 'visible',
    overrides.opencode_session_id || null,
    overrides.directory || '/repo/devhub',
    overrides.created_at || '2026-05-20T17:00:00.000Z',
    overrides.updated_at || '2026-05-20T17:00:00.000Z'
  );
}

function insertRun(db, overrides = {}) {
  const row = {
    run_id: overrides.run_id,
    workspace_id: overrides.workspace_id,
    task_id: overrides.task_id || null,
    agent_id: overrides.agent_id,
    requested_base_ref: overrides.requested_base_ref || 'main',
    baseline_commit: overrides.baseline_commit || 'f814998dd05cb491caf8637bf570dbd74b539090',
    observed_start_branch: overrides.observed_start_branch || 'main',
    observed_start_head: overrides.observed_start_head || `${overrides.run_id}-head`,
    observed_start_dirty: overrides.observed_start_dirty || 'clean',
    observed_start_path: overrides.observed_start_path || '/repo/devhub',
    status: overrides.status || 'running',
    predecessor_run_id: overrides.predecessor_run_id || null,
    recovery_group_id: overrides.recovery_group_id || null,
    created_at: overrides.created_at || '2026-05-20T17:00:00.000Z',
    updated_at: overrides.updated_at || '2026-05-20T17:00:00.000Z',
    completed_at: overrides.completed_at || null,
  };

  const keys = Object.keys(row);
  db.prepare(
    `INSERT INTO agent_runs (${keys.join(', ')}) VALUES (${keys.map(() => '?').join(', ')})`
  ).run(...keys.map((key) => row[key]));
}

function seedMission(db, input) {
  const mission = createSwarmMission(db, {
    mission_id: input.mission_id,
    project_id: input.project_id,
    task_id: input.task_id,
    owner_agent_id: input.owner_agent_id || 'director-1',
    kind: 'coordination',
    status: 'active',
    title: input.title || 'Team tell mission',
    started_at: '2026-05-20T17:00:00.000Z',
    updated_at: '2026-05-20T17:00:00.000Z',
  });

  for (const participant of input.participants) {
    registerMissionParticipant(db, {
      mission_id: mission.mission_id,
      agent_id: participant.agent_id,
      role_in_mission: participant.role_in_mission,
      status: participant.status || 'active',
      joined_at: '2026-05-20T17:00:00.000Z',
      updated_at: '2026-05-20T17:00:00.000Z',
    });
  }

  return mission;
}

function getMissionRows(db, missionId) {
  const message = db
    .prepare(
      'SELECT * FROM mission_messages WHERE mission_id = ? ORDER BY created_at DESC, rowid DESC LIMIT 1'
    )
    .get(missionId);
  const deliveries = db
    .prepare(
      `SELECT d.*
       FROM message_deliveries d
       JOIN mission_messages m ON m.message_id = d.message_id
       WHERE m.mission_id = ?
       ORDER BY d.recipient_agent_id ASC`
    )
    .all(missionId);
  return { message, deliveries };
}

function countRows(db, table) {
  return db.prepare(`SELECT COUNT(*) as count FROM ${table}`).get().count;
}

describe('MCP team_tell tool', () => {
  let harness;
  const userId = '54fee7d7-340d-4683-b259-b61a39567f94';

  beforeAll(async () => {
    harness = await createTestHarness({
      env: {
        DEVHUB_MCP_TEAM_TELL_FAKE_TRANSPORT: '1',
        DEVHUB_MCP_TEAM_TELL_TRANSPORT_LOG_PATH: transportLogPath,
      },
    });
    await harness.initialize();
  });

  beforeEach(() => {
    rmSync(transportLogPath, { force: true });
  });

  afterAll(async () => {
    rmSync(transportLogPath, { force: true });
    await harness.cleanup();
  });

  it('creates durable rows and reports sent for a single bound recipient', async () => {
    const project = await harness.callTool('create_project', {
      name: `team-tell-bound-${Date.now()}`,
    });
    const task = await harness.callTool('create_task', {
      project_id: project.project.id,
      user_id: userId,
      title: 'Bound team tell task',
    });

    const db = openDb(harness);
    try {
      seedMission(db, {
        mission_id: 'mission-team-tell-bound',
        project_id: project.project.id,
        task_id: task.task.id,
        participants: [
          { agent_id: 'director-1', role_in_mission: 'director' },
          { agent_id: 'worker-bound', role_in_mission: 'executor' },
        ],
      });
      insertWorkspace(db, {
        id: 'ws-team-tell-bound',
        project_id: project.project.id,
        agent_id: 'worker-bound',
        current_task_id: task.task.id,
        run_id_or_session_id: 'session-team-tell-bound',
      });
      insertSession(db, {
        id: 'session-team-tell-bound',
        project_id: project.project.id,
        opencode_session_id: 'oc-bound-worker',
      });
      insertRun(db, {
        run_id: 'run-team-tell-bound',
        workspace_id: 'ws-team-tell-bound',
        task_id: task.task.id,
        agent_id: 'worker-bound',
      });
    } finally {
      db.close();
    }

    const result = await harness.callTool('team_tell', {
      mission_id: 'mission-team-tell-bound',
      sender_agent_id: 'director-1',
      body_summary: 'Implement Batch 3',
      recipients: ['worker-bound'],
    });

    expect(result).toMatchObject({
      accepted: true,
      message: {
        mission_id: 'mission-team-tell-bound',
        message_kind: 'directive',
      },
      outcomes: [
        {
          recipient_agent_id: 'worker-bound',
          status: 'sent',
          reason: 'binding_found',
          delivery_ref: 'delivery-ref:oc-bound-worker',
          evidence_ref: 'evidence-ref:oc-bound-worker',
        },
      ],
    });
    expect(Object.keys(result.outcomes[0]).sort()).toEqual([
      'delivery_id',
      'delivery_ref',
      'evidence_ref',
      'reason',
      'recipient_agent_id',
      'status',
    ]);
    expect(readFileSync(transportLogPath, 'utf8')).toContain('oc-bound-worker');

    const verifyDb = openDb(harness);
    try {
      const { message, deliveries } = getMissionRows(verifyDb, 'mission-team-tell-bound');
      const teamMessages = verifyDb
        .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'team_messages'")
        .get();
      expect(message).toMatchObject({ body_summary: 'Implement Batch 3' });
      expect(deliveries).toHaveLength(1);
      expect(teamMessages || null).toBe(null);
      expect(deliveries[0]).toMatchObject({
        recipient_agent_id: 'worker-bound',
        channel: 'opencode',
        status: 'sent',
      });
    } finally {
      verifyDb.close();
    }
  });

  it('creates durable rows and reports pending + binding_missing for a single unbound recipient', async () => {
    const project = await harness.callTool('create_project', {
      name: `team-tell-unbound-${Date.now()}`,
    });
    const task = await harness.callTool('create_task', {
      project_id: project.project.id,
      user_id: userId,
      title: 'Unbound team tell task',
    });

    const db = openDb(harness);
    let countsBefore;
    try {
      countsBefore = {
        workspaces: countRows(db, 'agent_workspaces'),
        sessions: countRows(db, 'agent_hub_sessions'),
        runs: countRows(db, 'agent_runs'),
      };
      seedMission(db, {
        mission_id: 'mission-team-tell-unbound',
        project_id: project.project.id,
        task_id: task.task.id,
        participants: [
          { agent_id: 'director-1', role_in_mission: 'director' },
          { agent_id: 'worker-unbound', role_in_mission: 'executor' },
        ],
      });
    } finally {
      db.close();
    }

    const result = await harness.callTool('team_tell', {
      mission_id: 'mission-team-tell-unbound',
      sender_agent_id: 'director-1',
      body_summary: 'Wait for binding',
      recipients: ['worker-unbound'],
    });

    expect(result).toMatchObject({
      accepted: true,
      outcomes: [
        {
          recipient_agent_id: 'worker-unbound',
          status: 'pending',
          reason: 'binding_missing',
          delivery_ref: null,
          evidence_ref: null,
        },
      ],
    });
    expect(Object.keys(result.outcomes[0]).sort()).toEqual([
      'delivery_id',
      'delivery_ref',
      'evidence_ref',
      'reason',
      'recipient_agent_id',
      'status',
    ]);
    expect(existsSync(transportLogPath)).toBe(false);

    const verifyDb = openDb(harness);
    try {
      const { deliveries } = getMissionRows(verifyDb, 'mission-team-tell-unbound');
      const countsAfter = {
        workspaces: countRows(verifyDb, 'agent_workspaces'),
        sessions: countRows(verifyDb, 'agent_hub_sessions'),
        runs: countRows(verifyDb, 'agent_runs'),
      };
      expect(deliveries).toHaveLength(1);
      expect(countsAfter).toEqual(countsBefore);
      expect(deliveries[0]).toMatchObject({
        recipient_agent_id: 'worker-unbound',
        status: 'pending',
        last_error: 'binding_missing',
      });
    } finally {
      verifyDb.close();
    }
  });

  it('returns independent compact outcomes for a mixed batch', async () => {
    const project = await harness.callTool('create_project', {
      name: `team-tell-mixed-${Date.now()}`,
    });
    const task = await harness.callTool('create_task', {
      project_id: project.project.id,
      user_id: userId,
      title: 'Mixed team tell task',
    });

    const db = openDb(harness);
    try {
      seedMission(db, {
        mission_id: 'mission-team-tell-mixed',
        project_id: project.project.id,
        task_id: task.task.id,
        participants: [
          { agent_id: 'director-1', role_in_mission: 'director' },
          { agent_id: 'worker-sent', role_in_mission: 'executor' },
          { agent_id: 'worker-unbound', role_in_mission: 'executor' },
          { agent_id: 'worker-stale', role_in_mission: 'executor' },
        ],
      });
      insertWorkspace(db, {
        id: 'ws-team-tell-mixed-sent',
        project_id: project.project.id,
        agent_id: 'worker-sent',
        current_task_id: task.task.id,
        run_id_or_session_id: 'session-team-tell-mixed-sent',
      });
      insertSession(db, {
        id: 'session-team-tell-mixed-sent',
        project_id: project.project.id,
        opencode_session_id: 'oc-sent-worker',
      });
      insertRun(db, {
        run_id: 'run-team-tell-mixed-sent',
        workspace_id: 'ws-team-tell-mixed-sent',
        task_id: task.task.id,
        agent_id: 'worker-sent',
      });
      insertWorkspace(db, {
        id: 'ws-team-tell-mixed-stale',
        project_id: project.project.id,
        agent_id: 'worker-stale',
        current_task_id: task.task.id,
        run_id_or_session_id: 'session-team-tell-mixed-stale',
      });
      insertSession(db, {
        id: 'session-team-tell-mixed-stale',
        project_id: project.project.id,
        opencode_session_id: 'oc-stale-worker',
      });
      insertRun(db, {
        run_id: 'run-team-tell-mixed-stale',
        workspace_id: 'ws-team-tell-mixed-stale',
        task_id: task.task.id,
        agent_id: 'worker-stale',
      });
    } finally {
      db.close();
    }

    const result = await harness.callTool('team_tell', {
      mission_id: 'mission-team-tell-mixed',
      sender_agent_id: 'director-1',
      body_summary: 'Mixed delivery results',
      recipients: ['worker-sent', 'worker-unbound', 'worker-stale'],
    });

    expect(result.outcomes).toEqual([
      expect.objectContaining({
        recipient_agent_id: 'worker-sent',
        status: 'sent',
        reason: 'binding_found',
      }),
      expect.objectContaining({
        recipient_agent_id: 'worker-unbound',
        status: 'pending',
        reason: 'binding_missing',
      }),
      expect.objectContaining({
        recipient_agent_id: 'worker-stale',
        status: 'failed',
        reason: 'binding_stale',
      }),
    ]);

    const verifyDb = openDb(harness);
    try {
      const { deliveries } = getMissionRows(verifyDb, 'mission-team-tell-mixed');
      expect(deliveries).toHaveLength(3);
      expect(deliveries.map((row) => row.status)).toEqual(['sent', 'failed', 'pending']);
      expect(deliveries.some((row) => ['running', 'completed', 'error'].includes(row.status))).toBe(
        false
      );
    } finally {
      verifyDb.close();
    }
  });

  it('fails fast with bounded validation when recipient does not belong to the mission', async () => {
    const project = await harness.callTool('create_project', {
      name: `team-tell-invalid-${Date.now()}`,
    });
    const task = await harness.callTool('create_task', {
      project_id: project.project.id,
      user_id: userId,
      title: 'Invalid team tell task',
    });

    const db = openDb(harness);
    try {
      seedMission(db, {
        mission_id: 'mission-team-tell-invalid',
        project_id: project.project.id,
        task_id: task.task.id,
        participants: [
          { agent_id: 'director-1', role_in_mission: 'director' },
          { agent_id: 'worker-valid', role_in_mission: 'executor' },
        ],
      });
    } finally {
      db.close();
    }

    const result = await harness.callTool('team_tell', {
      mission_id: 'mission-team-tell-invalid',
      sender_agent_id: 'director-1',
      body_summary: 'This should fail',
      recipients: ['worker-valid', 'stranger-1'],
    });

    expect(result.raw).toContain('recipient_agent_id no pertenece a la misión');

    const verifyDb = openDb(harness);
    try {
      const { message, deliveries } = getMissionRows(verifyDb, 'mission-team-tell-invalid');
      expect(message || null).toBe(null);
      expect(deliveries).toHaveLength(0);
    } finally {
      verifyDb.close();
    }
  });
});
