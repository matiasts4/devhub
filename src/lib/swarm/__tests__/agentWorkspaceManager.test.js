/**
 * Unit tests for AgentWorkspaceManager
 *
 * Tests verify worktree path calculation, branch naming,
 * idempotency, and error handling WITHOUT requiring git.
 */

const path = require('path');
const {
  computeWorktreePath,
  computeBranchName,
  buildLaunchWorkspaceRoot,
  validateWorktreePath,
  parseWorktreeInfo,
  isDevHubWorktreePath,
  isPlyriumWorktreePath,
  toPosixPath,
  pathsEqual,
  pathIsUnder,
} = require('../agentWorkspaceManager');

describe('AgentWorkspaceManager — pure helpers', () => {
  describe('path helpers (Windows-safe)', () => {
    test('toPosixPath converts backslashes', () => {
      expect(toPosixPath('D:\\devhub\\.devhub\\worktrees\\launch-1\\zed')).toBe(
        'D:/devhub/.devhub/worktrees/launch-1/zed'
      );
    });

    test('isDevHubWorktreePath accepts Windows separators', () => {
      expect(isDevHubWorktreePath('D:\\devhub\\.devhub\\worktrees\\launch-1\\zed')).toBe(true);
      expect(isDevHubWorktreePath('/repo/.devhub/worktrees/launch-1/coder')).toBe(true);
      expect(isDevHubWorktreePath('/repo/src')).toBe(false);
    });

    test('isPlyriumWorktreePath accepts Windows separators', () => {
      expect(isPlyriumWorktreePath('D:\\repo\\.plyrium-forge\\worktrees\\x')).toBe(true);
      expect(isPlyriumWorktreePath('/repo/.plyrium-forge/worktrees/x')).toBe(true);
      expect(isPlyriumWorktreePath('/repo/.devhub/worktrees/x')).toBe(false);
    });

    test('pathsEqual is separator-safe', () => {
      expect(
        pathsEqual(
          'D:\\devhub\\.devhub\\worktrees\\launch-1\\zed',
          'D:/devhub/.devhub/worktrees/launch-1/zed'
        )
      ).toBe(true);
    });

    test('pathIsUnder is separator-safe', () => {
      expect(
        pathIsUnder(
          'D:\\devhub\\.devhub\\worktrees\\launch-1\\zed',
          'D:/devhub/.devhub/worktrees/launch-1'
        )
      ).toBe(true);
    });
  });

  describe('buildLaunchWorkspaceRoot', () => {
    test('returns .devhub/worktrees/<launch-id> under repo root', () => {
      const result = buildLaunchWorkspaceRoot('/some/repo', 'launch-abc123');
      expect(result).toBe(path.join('/some/repo', '.devhub', 'worktrees', 'launch-abc123'));
    });

    test('handles repo root with trailing slash', () => {
      const result = buildLaunchWorkspaceRoot('/some/repo/', 'launch-xyz');
      expect(result).toBe(path.join('/some/repo', '.devhub', 'worktrees', 'launch-xyz'));
    });

    test('handles repo root with trailing backslash (Windows)', () => {
      const result = buildLaunchWorkspaceRoot('D:\\devhub\\', 'launch-xyz');
      expect(result).toBe(path.join('D:\\devhub', '.devhub', 'worktrees', 'launch-xyz'));
    });

    test('does NOT use .plyrium-forge path', () => {
      const result = buildLaunchWorkspaceRoot('/some/repo', 'launch-abc');
      expect(result).not.toContain('.plyrium-forge');
    });
  });

  describe('computeWorktreePath', () => {
    test('returns correct path for a role', () => {
      const result = computeWorktreePath('/some/repo', 'launch-abc', 'coder');
      expect(result).toBe(path.join('/some/repo', '.devhub', 'worktrees', 'launch-abc', 'coder'));
    });

    test('handles all standard roles', () => {
      const roles = ['director', 'coder', 'auditor', 'devops', 'architect'];
      for (const role of roles) {
        const result = computeWorktreePath('/repo', 'launch-1', role);
        expect(result).toBe(path.join('/repo', '.devhub', 'worktrees', 'launch-1', role));
        expect(result).not.toContain('.plyrium-forge');
      }
    });

    test('handles custom role keys', () => {
      const result = computeWorktreePath('/repo', 'launch-1', 'reviewer-1');
      expect(result).toBe(path.join('/repo', '.devhub', 'worktrees', 'launch-1', 'reviewer-1'));
    });
  });

  describe('computeBranchName', () => {
    test('returns devhub/swarm/<launch-id>/<role>', () => {
      const result = computeBranchName('launch-abc', 'coder');
      expect(result).toBe('devhub/swarm/launch-abc/coder');
    });

    test('handles all standard roles', () => {
      const roles = ['director', 'coder', 'auditor', 'devops', 'architect'];
      for (const role of roles) {
        const result = computeBranchName('launch-xyz', role);
        expect(result).toBe(`devhub/swarm/launch-xyz/${role}`);
      }
    });

    test('does NOT use plyrium branch naming', () => {
      const result = computeBranchName('launch-abc', 'coder');
      expect(result).not.toContain('pane/');
      expect(result).not.toContain('plyrium');
    });
  });

  describe('validateWorktreePath', () => {
    // Use path.join so the mock matches path.join(worktreePath, '.git') on every OS.
    const sampleWorktree = path.join('/repo', '.devhub', 'worktrees', 'launch-abc', 'coder');

    test('returns valid for existing worktree path', () => {
      const result = validateWorktreePath(sampleWorktree, {
        existsSync: (p) => p === sampleWorktree || p === path.join(sampleWorktree, '.git'),
      });
      expect(result.valid).toBe(true);
      expect(result.error).toBeNull();
    });

    test('returns invalid for non-existent path', () => {
      const result = validateWorktreePath(sampleWorktree, {
        existsSync: () => false,
      });
      expect(result.valid).toBe(false);
      expect(result.error).toContain('does not exist');
    });

    test('returns invalid when .git is missing', () => {
      const result = validateWorktreePath(sampleWorktree, {
        existsSync: (p) => p === sampleWorktree,
      });
      expect(result.valid).toBe(false);
      expect(result.error).toContain('.git');
    });

    test('rejects paths under .plyrium-forge', () => {
      const result = validateWorktreePath(path.join('/repo', '.plyrium-forge', 'worktrees', 'x'), {
        existsSync: () => true,
      });
      expect(result.valid).toBe(false);
      expect(result.error).toContain('.plyrium-forge');
    });

    test('rejects paths not under .devhub/worktrees', () => {
      const result = validateWorktreePath(path.join('/repo', 'some', 'other', 'path'), {
        existsSync: () => true,
      });
      expect(result.valid).toBe(false);
      expect(result.error).toContain('.devhub/worktrees');
    });

    test('accepts Windows-style .devhub\\worktrees path (launch regression)', () => {
      const winPath = 'D:\\devhub\\.devhub\\worktrees\\launch-050258c7\\zed';
      const result = validateWorktreePath(winPath, {
        existsSync: (p) => p === winPath || p === path.join(winPath, '.git'),
      });
      expect(result.valid).toBe(true);
      expect(result.error).toBeNull();
    });
  });

  describe('parseWorktreeInfo', () => {
    test('parses porcelain worktree list output', () => {
      const output = `worktree /repo/.devhub/worktrees/launch-abc/coder
HEAD abc123def456
branch refs/heads/devhub/swarm/launch-abc/coder
`;
      const result = parseWorktreeInfo(output);
      expect(result).toHaveLength(1);
      expect(result[0]).toEqual({
        path: '/repo/.devhub/worktrees/launch-abc/coder',
        head: 'abc123def456',
        branch: 'refs/heads/devhub/swarm/launch-abc/coder',
      });
    });

    test('parses multiple worktrees', () => {
      const output = `worktree /repo/.devhub/worktrees/launch-abc/director
HEAD 111aaa
branch refs/heads/devhub/swarm/launch-abc/director
worktree /repo/.devhub/worktrees/launch-abc/coder
HEAD 222bbb
branch refs/heads/devhub/swarm/launch-abc/coder
`;
      const result = parseWorktreeInfo(output);
      expect(result).toHaveLength(2);
      expect(result[0].path).toContain('director');
      expect(result[1].path).toContain('coder');
    });

    test('returns empty array for empty output', () => {
      expect(parseWorktreeInfo('')).toEqual([]);
      expect(parseWorktreeInfo('\n')).toEqual([]);
    });
  });
});
