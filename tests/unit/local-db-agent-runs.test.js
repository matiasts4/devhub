const Database = require('better-sqlite3');
const {
  ensureRuntimeSchema,
  createAgentRun,
  updateAgentRunTerminal,
  appendAgentArtifact,
  listAgentArtifacts,
  listAgentRuns,
  getLatestAgentRunForWorkspace,
} = require('../../src/lib/db/localDb');
const { normalizeEvidenceRef, parseEvidenceRef } = require('../../src/lib/db/agentRunArtifacts');

function insertWorkspace(db, overrides = {}) {
  const row = {
    id: overrides.id || 'ws-1',
    project_id: overrides.project_id || 'project-1',
    agent_id: overrides.agent_id || 'agent-1',
    current_task_id: overrides.current_task_id || 'task-1',
    run_id_or_session_id: overrides.run_id_or_session_id || null,
    repo_root: '/repo/devhub',
    workspace_path: overrides.workspace_path || 'workspace://project-1/ws-1',
    worktree_path: overrides.worktree_path ?? null,
    base_branch: 'main',
    base_commit: 'f814998dd05cb491caf8637bf570dbd74b539090',
    branch_name: overrides.branch_name ?? null,
    status: overrides.status || 'provisioning',
    observed_branch: overrides.observed_branch ?? null,
    observed_head: overrides.observed_head ?? null,
    observed_dirty: overrides.observed_dirty ?? null,
    last_error: null,
    last_error_class: null,
    recovery_reason: null,
    evidence_ref: null,
    reservation_token: overrides.reservation_token ?? null,
    correlation_id: overrides.correlation_id ?? null,
    accepted_at: overrides.accepted_at ?? null,
    claimed_at: null,
    started_at: null,
    updated_at: overrides.updated_at ?? '2026-05-18T22:00:00.000Z',
    completed_at: null,
  };

  const keys = Object.keys(row);
  db.prepare(
    `INSERT INTO agent_workspaces (${keys.join(', ')}) VALUES (${keys.map(() => '?').join(', ')})`
  ).run(...keys.map((key) => row[key]));

  return row;
}

describe('localDb agent runs + artifacts', () => {
  let db;

  beforeEach(() => {
    db = new Database(':memory:');
    ensureRuntimeSchema(db);
    insertWorkspace(db, {
      id: 'ws-run-1',
      current_task_id: 'task-run-1',
      agent_id: 'agent-run-1',
      workspace_path: 'workspace://project-1/ws-run-1',
    });
  });

  afterEach(() => {
    db.close();
  });

  test('persists immutable agent run headers and append-only artifacts in run sequence order', () => {
    const run = createAgentRun(db, {
      run_id: 'run-1',
      workspace_id: 'ws-run-1',
      task_id: 'task-run-1',
      agent_id: 'agent-run-1',
      requested_base_ref: 'f814998dd05cb491caf8637bf570dbd74b539090',
      baseline_commit: 'f814998dd05cb491caf8637bf570dbd74b539090',
      observed_start: {
        branch: null,
        head: null,
        dirty: 'dirty-excluded',
        path: 'workspace://project-1/ws-run-1',
      },
      status: 'running',
      recovery_group_id: 'recovery-1',
    });

    const legacyArtifact = appendAgentArtifact(db, {
      artifact_id: 'artifact-1',
      run_id: run.run_id,
      phase: 'prepare',
      kind: 'workspace.prepared',
      producer: 'executor',
      summary: 'Workspace accepted by executor.',
      evidence_ref: 'evidence://prepare-ready-1',
      integrity: { observed_at: '2026-05-18T22:10:00.000Z' },
    });

    const structuredArtifact = appendAgentArtifact(db, {
      artifact_id: 'artifact-2',
      run_id: run.run_id,
      phase: 'qa',
      kind: 'qa.result',
      producer: 'qa',
      summary: 'QA outcome stored.',
      evidence_ref: normalizeEvidenceRef({
        kind: 'qa.result',
        locator: 'artifact://run-1/qa/2',
        version: '1',
      }),
      supersedes_artifact_id: 'artifact-1',
      integrity: { observed_at: '2026-05-18T22:11:00.000Z', locator_version: '1' },
    });

    const listedRuns = listAgentRuns(db, { workspace_id: 'ws-run-1' });
    const listedArtifacts = listAgentArtifacts(db, 'run-1');
    const latestRun = getLatestAgentRunForWorkspace(db, 'ws-run-1');

    expect(run.run_id).toBe('run-1');
    expect(run.observed_start_dirty).toBe('dirty-excluded');
    expect(listedRuns).toHaveLength(1);
    expect(latestRun.run_id).toBe('run-1');
    expect(legacyArtifact.seq).toBe(1);
    expect(structuredArtifact.seq).toBe(2);
    expect(listedArtifacts.map((artifact) => artifact.artifact_id)).toEqual([
      'artifact-1',
      'artifact-2',
    ]);
    expect(parseEvidenceRef(listedArtifacts[0].evidence_ref)).toEqual({
      kind: 'legacy-opaque',
      locator: 'evidence://prepare-ready-1',
      version: null,
    });
    expect(parseEvidenceRef(listedArtifacts[1].evidence_ref)).toEqual({
      kind: 'qa.result',
      locator: 'artifact://run-1/qa/2',
      version: '1',
    });
  });

  test('allows terminal metadata updates but blocks provenance rewrites and artifact mutation', () => {
    createAgentRun(db, {
      run_id: 'run-immutability',
      workspace_id: 'ws-run-1',
      task_id: 'task-run-1',
      agent_id: 'agent-run-1',
      requested_base_ref: 'f814998dd05cb491caf8637bf570dbd74b539090',
      baseline_commit: 'f814998dd05cb491caf8637bf570dbd74b539090',
      observed_start: { dirty: 'dirty-excluded', path: 'workspace://project-1/ws-run-1' },
      status: 'running',
    });

    appendAgentArtifact(db, {
      artifact_id: 'artifact-immutability',
      run_id: 'run-immutability',
      phase: 'execute',
      kind: 'decision.note',
      producer: 'devhub',
      summary: 'Launch accepted.',
      evidence_ref: 'evidence://run-intent-1',
      integrity: { observed_at: '2026-05-18T22:20:00.000Z' },
    });

    const closed = updateAgentRunTerminal(db, 'run-immutability', {
      status: 'succeeded',
      terminal_reason_class: 'qa_approved',
      completed_at: '2026-05-18T22:30:00.000Z',
    });

    expect(closed.status).toBe('succeeded');
    expect(closed.terminal_reason_class).toBe('qa_approved');

    expect(() =>
      db
        .prepare('UPDATE agent_runs SET requested_base_ref = ? WHERE run_id = ?')
        .run('main', 'run-immutability')
    ).toThrow(/agent_runs_provenance_immutable/);

    expect(() =>
      db
        .prepare('UPDATE agent_artifacts SET summary = ? WHERE artifact_id = ?')
        .run('mutated', 'artifact-immutability')
    ).toThrow(/agent_artifacts_append_only/);
  });

  test('validates artifact contracts, lineage links, and evidence ref normalization helpers', () => {
    createAgentRun(db, {
      run_id: 'run-lineage-parent',
      workspace_id: 'ws-run-1',
      task_id: 'task-run-1',
      agent_id: 'agent-run-1',
      requested_base_ref: 'f814998dd05cb491caf8637bf570dbd74b539090',
      baseline_commit: 'f814998dd05cb491caf8637bf570dbd74b539090',
      observed_start: { dirty: 'dirty-excluded', path: 'workspace://project-1/ws-run-1' },
      status: 'failed',
    });

    const retry = createAgentRun(db, {
      run_id: 'run-lineage-retry',
      workspace_id: 'ws-run-1',
      task_id: 'task-run-1',
      agent_id: 'agent-run-1',
      requested_base_ref: 'f814998dd05cb491caf8637bf570dbd74b539090',
      baseline_commit: 'f814998dd05cb491caf8637bf570dbd74b539090',
      observed_start: { dirty: 'dirty-excluded', path: 'workspace://project-1/ws-run-1' },
      status: 'running',
      predecessor_run_id: 'run-lineage-parent',
      recovery_group_id: 'recovery-group-1',
    });

    expect(retry.predecessor_run_id).toBe('run-lineage-parent');
    expect(retry.recovery_group_id).toBe('recovery-group-1');

    expect(() =>
      appendAgentArtifact(db, {
        run_id: retry.run_id,
        phase: 'ship-it',
        kind: 'workspace.prepared',
        producer: 'executor',
        summary: 'invalid phase',
        evidence_ref: 'evidence://invalid-phase',
        integrity: { observed_at: '2026-05-18T22:40:00.000Z' },
      })
    ).toThrow(/artifact phase/i);

    expect(normalizeEvidenceRef('evidence://legacy-ref')).toBe('evidence://legacy-ref');
    expect(
      normalizeEvidenceRef({ kind: 'diff.patch', locator: 'artifact://run-lineage-retry/diff/1' })
    ).toBe(JSON.stringify({ kind: 'diff.patch', locator: 'artifact://run-lineage-retry/diff/1' }));
  });
});
