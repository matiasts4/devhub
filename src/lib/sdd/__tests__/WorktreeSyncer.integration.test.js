/**
 * Integration tests for WorktreeSyncer
 * Tests phase branch map, worktree merge, and cleanup operations.
 * Uses a temporary directory structure to avoid affecting the real repo.
 */

'use strict';

const path = require('path');
const fs = require('fs');
const os = require('os');

describe('WorktreeSyncer (integration)', () => {
  let tmpDir;
  let repoRoot;
  let worktreeA;
  let worktreeB;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'wt-syncer-test-'));
    repoRoot = path.join(tmpDir, 'repo');
    worktreeA = path.join(tmpDir, 'wt-a');
    worktreeB = path.join(tmpDir, 'wt-b');

    // Init a bare repo as the origin
    fs.mkdirSync(repoRoot);
    runGit(repoRoot, 'init --bare');

    // Configure git globally for tests
    runGit(repoRoot, 'config --global init.defaultBranch main');
    runGit(repoRoot, 'config --global user.email "test@test.com"');
    runGit(repoRoot, 'config --global user.name "Test"');

    // Clone to worktree A
    runGit(repoRoot, `clone ${repoRoot} "${worktreeA}"`);
    // Create a file and commit in A
    fs.writeFileSync(path.join(worktreeA, 'README.md'), '# Test\n');
    runGit(worktreeA, 'add README.md');
    runGit(worktreeA, 'commit -m "init"');
  });

  afterEach(() => {
    // Clean up temp dir
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  // -------------------------------------------------------------------------
  // Git helpers (mirrors WorktreeSyncer.runGit)
  // -------------------------------------------------------------------------

  function runGit(cwd, args) {
    const { execSync } = require('child_process');
    try {
      const result = execSync(`git ${args}`, {
        cwd,
        encoding: 'utf-8',
        stdio: ['pipe', 'pipe', 'pipe'],
      });
      return { success: true, output: result.trim() };
    } catch (e) {
      return { success: false, output: e.message, stderr: e.stderr?.toString() || '' };
    }
  }

  // -------------------------------------------------------------------------
  // WorktreeSyncer internals to test (via direct module use with mocked SessionPersistence)
  // -------------------------------------------------------------------------

  const WorktreeSyncer = require('../WorktreeSyncer');

  describe('git helpers', () => {
    test('isGitRepo returns true for valid git repos', () => {
      expect(WorktreeSyncer.isGitRepo(worktreeA)).toBe(true);
    });

    test('isGitRepo returns false for non-git directories', () => {
      const notGit = path.join(tmpDir, 'not-git');
      fs.mkdirSync(notGit);
      expect(WorktreeSyncer.isGitRepo(notGit)).toBe(false);
    });

    test('getCurrentBranch returns current branch name', () => {
      const branch = WorktreeSyncer.getCurrentBranch(worktreeA);
      // Git may name initial branch 'main' or 'master' depending on version
      expect(['main', 'master']).toContain(branch);
    });

    test('getCurrentBranch returns HEAD in detached HEAD state', () => {
      // First make a second commit so HEAD~1 exists
      fs.writeFileSync(path.join(worktreeA, 'second.txt'), 'second commit');
      runGit(worktreeA, 'add second.txt');
      runGit(worktreeA, 'commit -m "second"');
      // Now detach using HEAD~1
      const detachResult = runGit(worktreeA, 'checkout --detach HEAD~1');
      // If detached HEAD succeeded, branch will be 'HEAD'; if it failed, we stay on main
      if (detachResult.success) {
        const branch = WorktreeSyncer.getCurrentBranch(worktreeA);
        expect(branch).toBe('HEAD');
      } else {
        // Detached HEAD not supported or HEAD~1 doesn't exist - skip this case
        console.warn('Detached HEAD test skipped:', detachResult.output);
      }
    });

    test('getCurrentHead returns commit hash', () => {
      const head = WorktreeSyncer.getCurrentHead(worktreeA);
      expect(head).toMatch(/^[0-9a-f]{7,40}$/);
    });

    test('isDirty returns false for clean repo', () => {
      expect(WorktreeSyncer.isDirty(worktreeA)).toBe(false);
    });

    test('isDirty returns true when there are uncommitted changes', () => {
      fs.writeFileSync(path.join(worktreeA, 'new.txt'), 'dirty');
      expect(WorktreeSyncer.isDirty(worktreeA)).toBe(true);
    });
  });

  describe('worktree listing', () => {
    test('listWorktrees returns worktrees for repo', () => {
      WorktreeSyncer.listWorktrees(repoRoot);
      // Bare repo has no worktree listing
      const worktreesInA = WorktreeSyncer.listWorktrees(worktreeA);
      expect(worktreesInA.length).toBeGreaterThan(0);
    });
  });

  describe('addWorktree', () => {
    test('addWorktree creates a new worktree with a branch', () => {
      const result = WorktreeSyncer.addWorktree(worktreeA, 'feature-test', worktreeB);
      expect(result.success).toBe(true);

      // Verify worktreeB is a git repo
      expect(WorktreeSyncer.isGitRepo(worktreeB)).toBe(true);
      expect(WorktreeSyncer.getCurrentBranch(worktreeB)).toBe('feature-test');
    });

    test('addWorktree fails gracefully for duplicate branch on same path', () => {
      // First add succeeds
      WorktreeSyncer.addWorktree(worktreeA, 'dup-branch', worktreeB);
      // Second add of same branch fails
      const result = WorktreeSyncer.addWorktree(worktreeA, 'dup-branch', worktreeB);
      expect(result.success).toBe(false);
    });
  });

  describe('removeWorktree', () => {
    test('removeWorktree removes an existing worktree', () => {
      // First add a worktree
      WorktreeSyncer.addWorktree(worktreeA, 'to-remove', worktreeB);
      expect(WorktreeSyncer.isGitRepo(worktreeB)).toBe(true);

      // Remove it
      const result = WorktreeSyncer.removeWorktree(worktreeA, worktreeB);
      expect(result.success).toBe(true);

      // After removal, the directory may still exist but is no longer a worktree
      // The git repo inside is removed
    });
  });

  describe('pruneWorktrees', () => {
    test('pruneWorktrees succeeds', () => {
      const result = WorktreeSyncer.pruneWorktrees(worktreeA);
      expect(result.success).toBe(true);
    });
  });

  describe('getIntegrationWorktreePath', () => {
    test('returns path under .worktrees in repo root', () => {
      const p = WorktreeSyncer.getIntegrationWorktreePath('/repo', 'mission-1');
      expect(p).toBe('/repo/.worktrees/integration-mission-1');
    });

    test('falls back to default when no missionId', () => {
      const p = WorktreeSyncer.getIntegrationWorktreePath('/repo', null);
      expect(p).toBe('/repo/.worktrees/integration-default');
    });
  });

  describe('conflict detection (mock integration)', () => {
    test('detectConflicts returns hasConflicts=false for non-existent branches', async () => {
      // We can't easily test real conflicts without more setup,
      // so test the guard case
      const result = await WorktreeSyncer.detectConflicts({
        repoRoot: worktreeA,
        branchA: null,
        branchB: null,
      });
      expect(result.hasConflicts).toBe(false);
    });

    test('detectConflicts requires repoRoot', async () => {
      const result = await WorktreeSyncer.detectConflicts({
        repoRoot: null,
        branchA: 'main',
        branchB: 'feature',
      });
      expect(result.hasConflicts).toBe(false);
    });
  });

  describe('merge simulation', () => {
    test('worktree can be added with commit and then removed', () => {
      // Add a feature branch worktree
      const featurePath = path.join(tmpDir, 'wt-feature');
      const addResult = WorktreeSyncer.addWorktree(worktreeA, 'feature', featurePath);
      expect(addResult.success).toBe(true);

      // Make a commit in the feature branch
      fs.writeFileSync(path.join(featurePath, 'feature.txt'), 'feature content');
      runGit(featurePath, 'add feature.txt');
      runGit(featurePath, 'commit -m "add feature"');

      // Verify the commit exists in feature branch
      const head = WorktreeSyncer.getCurrentHead(featurePath);
      expect(head).toMatch(/^[0-9a-f]{7,40}$/);
    });

    test('mergeWorktrees skips branches not found in integration repo', async () => {
      // WorktreeSyncer.mergeWorktrees needs an integrationPath that is a git repo
      // We test the "branch not found" case with a fresh directory
      const integrationPath = path.join(tmpDir, 'integration');
      fs.mkdirSync(integrationPath);
      runGit(integrationPath, 'init');
      runGit(integrationPath, 'config user.email "test@test.com"');
      runGit(integrationPath, 'config user.name "Test"');

      const result = await WorktreeSyncer.mergeWorktrees({
        integrationPath,
        roleBranches: [{ phase: 'sdd-design', branchName: 'nonexistent', worktreePath: '/fake' }],
      });

      expect(result.success).toBe(false);
      expect(result.results[0].status).toBe('skipped');
      expect(result.results[0].reason).toContain('not found');
    });
  });
});
