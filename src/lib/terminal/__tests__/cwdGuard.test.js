/**
 * Unit tests for cwdGuard swarm validation
 */

const {
  isDevHubWorktreePath,
  isPlyriumWorktreePath,
  validateSwarmCwd,
} = require('../cwdGuard');

describe('cwdGuard — swarm validation', () => {
  describe('isDevHubWorktreePath', () => {
    test('returns true for .devhub/worktrees paths', () => {
      expect(isDevHubWorktreePath('/repo/.devhub/worktrees/launch-abc/coder')).toBe(true);
    });

    test('returns false for other paths', () => {
      expect(isDevHubWorktreePath('/repo/src')).toBe(false);
      expect(isDevHubWorktreePath('/repo/.plyrium-forge/worktrees/x')).toBe(false);
    });
  });

  describe('isPlyriumWorktreePath', () => {
    test('returns true for .plyrium-forge paths', () => {
      expect(isPlyriumWorktreePath('/repo/.plyrium-forge/worktrees/x')).toBe(true);
    });

    test('returns false for other paths', () => {
      expect(isPlyriumWorktreePath('/repo/.devhub/worktrees/launch-abc/coder')).toBe(false);
    });
  });

  describe('validateSwarmCwd', () => {
    const mockFs = {
      existsSync: (p) =>
        p === '/repo/.devhub/worktrees/launch-abc/coder' ||
        p === '/repo/.devhub/worktrees/launch-abc/coder/.git',
    };

    test('validates correct swarm worktree path', () => {
      const result = validateSwarmCwd({
        requestedCwd: '/repo/.devhub/worktrees/launch-abc/coder',
        roleKey: 'coder',
        repoRoot: '/repo',
        isSwarmRole: true,
        fsImpl: mockFs,
      });
      expect(result.valid).toBe(true);
      expect(result.error).toBeNull();
      expect(result.effectiveCwd).toBe('/repo/.devhub/worktrees/launch-abc/coder');
    });

    test('rejects empty cwd', () => {
      const result = validateSwarmCwd({
        requestedCwd: '',
        roleKey: 'coder',
        repoRoot: '/repo',
        isSwarmRole: true,
        fsImpl: mockFs,
      });
      expect(result.valid).toBe(false);
      expect(result.error).toContain('empty');
    });

    test('rejects Plyrium paths', () => {
      const result = validateSwarmCwd({
        requestedCwd: '/repo/.plyrium-forge/worktrees/x',
        roleKey: 'coder',
        repoRoot: '/repo',
        isSwarmRole: true,
        fsImpl: mockFs,
      });
      expect(result.valid).toBe(false);
      expect(result.error).toContain('.plyrium-forge');
    });

    test('rejects non-devhub paths for swarm roles', () => {
      const result = validateSwarmCwd({
        requestedCwd: '/repo/src',
        roleKey: 'coder',
        repoRoot: '/repo',
        isSwarmRole: true,
        fsImpl: mockFs,
      });
      expect(result.valid).toBe(false);
      expect(result.error).toContain('.devhub/worktrees');
    });

    test('rejects non-existent worktree', () => {
      const result = validateSwarmCwd({
        requestedCwd: '/repo/.devhub/worktrees/launch-xxx/coder',
        roleKey: 'coder',
        repoRoot: '/repo',
        isSwarmRole: true,
        fsImpl: { existsSync: () => false },
      });
      expect(result.valid).toBe(false);
      expect(result.error).toContain('does not exist');
    });

    test('rejects worktree without .git marker', () => {
      const result = validateSwarmCwd({
        requestedCwd: '/repo/.devhub/worktrees/launch-abc/coder',
        roleKey: 'coder',
        repoRoot: '/repo',
        isSwarmRole: true,
        fsImpl: {
          existsSync: (p) => p === '/repo/.devhub/worktrees/launch-abc/coder',
        },
      });
      expect(result.valid).toBe(false);
      expect(result.error).toContain('.git');
    });

    test('allows non-swarm roles to use any valid path', () => {
      const result = validateSwarmCwd({
        requestedCwd: '/repo/src',
        roleKey: 'shell',
        repoRoot: '/repo',
        isSwarmRole: false,
        fsImpl: { existsSync: () => true },
      });
      expect(result.valid).toBe(true);
    });
  });
});
