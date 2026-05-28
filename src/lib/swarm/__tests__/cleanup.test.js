const fs = require('fs');
const os = require('os');
const path = require('path');

const { createTempDb, cleanupDb } = require('../../../../devhub-cli/tests/fixtures/seed-factory');

function seedWorkspace(db, workspace) {
  const status = workspace.status || (workspace.worktreePath ? 'active' : 'planned');
  db.prepare(
    `INSERT INTO agent_workspaces (
      id, project_id, agent_id, repo_root, workspace_path, worktree_path,
      base_branch, branch_name, observed_branch, observed_head, status
    ) VALUES (?, ?, ?, ?, ?, ?, 'main', ?, ?, ?, ?)`
  ).run(
    workspace.id,
    workspace.projectId || 'proj-cleanup',
    workspace.agentId || 'agent-1',
    workspace.repoRoot,
    workspace.workspacePath || `/tmp/workspace-${workspace.id}`,
    workspace.worktreePath ?? null,
    workspace.branchName,
    workspace.branchName,
    workspace.observedHead || 'abc123',
    status
  );
}

describe('cleanupMissionWorktrees', () => {
  let dbPath;
  let tmpRoot;
  let cleanupModule;
  let localDb;

  beforeEach(() => {
    jest.resetModules();
    dbPath = createTempDb();
    tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'devhub-cleanup-'));
    process.env.DEVHUB_DB_PATH = dbPath;
    process.env.NODE_ENV = 'test';

    localDb = require('../../db/localDb');
    cleanupModule = require('../cleanup');

    const db = localDb.getDb();
    db.prepare(
      "INSERT INTO projects (id, user_id, name, status) VALUES ('proj-cleanup', 'user-1', 'Cleanup Project', 'active')"
    ).run();
  });

  afterEach(() => {
    if (localDb?.closeDb) {
      localDb.closeDb();
    }
    cleanupDb(dbPath);
    fs.rmSync(tmpRoot, { recursive: true, force: true });
    delete process.env.DEVHUB_DB_PATH;
  });

  it('uses the persisted worktree_path for mission cleanup results', () => {
    const db = localDb.getDb();
    const worktreePath = path.join(tmpRoot, 'launch-worktree');
    fs.mkdirSync(worktreePath, { recursive: true });

    seedWorkspace(db, {
      id: 'ws-cleanup-1',
      repoRoot: tmpRoot,
      worktreePath,
      branchName: 'feature/launch-123/agent-1',
    });

    const result = cleanupModule.cleanupMissionWorktrees(
      { repoRoot: tmpRoot, launchId: 'launch-123' },
      { dryRun: true, force: true }
    );

    expect(result.workspaces_processed).toBe(1);
    expect(result.results).toEqual([
      expect.objectContaining({
        workspace_id: 'ws-cleanup-1',
        worktree_path: worktreePath,
        success: true,
        dry_run: true,
        message: `Would remove worktree: ${worktreePath}`,
      }),
    ]);
  });

  it('reports workspaces with missing persisted paths instead of skipping them silently', () => {
    const db = localDb.getDb();

    seedWorkspace(db, {
      id: 'ws-cleanup-missing',
      repoRoot: tmpRoot,
      worktreePath: null,
      branchName: 'feature/launch-123/agent-2',
    });

    const result = cleanupModule.cleanupMissionWorktrees(
      { repoRoot: tmpRoot, launchId: 'launch-123' },
      { dryRun: true, force: true }
    );

    expect(result.workspaces_processed).toBe(1);
    expect(result.results).toEqual([
      expect.objectContaining({
        workspace_id: 'ws-cleanup-missing',
        success: false,
        reason: 'missing_worktree_path',
        worktree_path: null,
      }),
    ]);
  });
});
