/**
 * Unit tests for cwdGuard swarm validation
 */

const path = require('path');
const { isDevHubWorktreePath, isPlyriumWorktreePath, validateSwarmCwd } = require('../cwdGuard');

describe('cwdGuard — swarm validation', () => {
  describe('isDevHubWorktreePath', () => {
    test('returns true for .devhub/worktrees paths', () => {
      expect(isDevHubWorktreePath('/repo/.devhub/worktrees/launch-abc/coder')).toBe(true);
    });

    test('returns true for Windows backslash worktree paths', () => {
      expect(isDevHubWorktreePath('D:\\devhub\\.devhub\\worktrees\\launch-abc\\coder')).toBe(true);
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

    test('returns true for Windows backslash plyrium paths', () => {
      expect(isPlyriumWorktreePath('D:\\repo\\.plyrium-forge\\worktrees\\x')).toBe(true);
    });

    test('returns false for other paths', () => {
      expect(isPlyriumWorktreePath('/repo/.devhub/worktrees/launch-abc/coder')).toBe(false);
    });
  });

  describe('validateSwarmCwd', () => {
    // path.resolve normalizes differently per OS; mock against the resolved form.
    const sampleCwd = path.resolve('/repo/.devhub/worktrees/launch-abc/coder');
    const sampleGit = path.join(sampleCwd, '.git');
    const mockFs = {
      existsSync: (p) => p === sampleCwd || p === sampleGit,
    };

    test('validates correct swarm worktree path', () => {
      const result = validateSwarmCwd({
        requestedCwd: sampleCwd,
        roleKey: 'coder',
        repoRoot: path.resolve('/repo'),
        isSwarmRole: true,
        fsImpl: mockFs,
      });
      expect(result.valid).toBe(true);
      expect(result.error).toBeNull();
      expect(result.effectiveCwd).toBe(sampleCwd);
    });

    test('rejects empty cwd', () => {
      const result = validateSwarmCwd({
        requestedCwd: '',
        roleKey: 'coder',
        repoRoot: path.resolve('/repo'),
        isSwarmRole: true,
        fsImpl: mockFs,
      });
      expect(result.valid).toBe(false);
      expect(result.error).toContain('empty');
    });

    test('rejects Plyrium paths', () => {
      const result = validateSwarmCwd({
        requestedCwd: path.resolve('/repo/.plyrium-forge/worktrees/x'),
        roleKey: 'coder',
        repoRoot: path.resolve('/repo'),
        isSwarmRole: true,
        fsImpl: mockFs,
      });
      expect(result.valid).toBe(false);
      expect(result.error).toContain('.plyrium-forge');
    });

    test('rejects non-devhub paths for swarm roles', () => {
      const result = validateSwarmCwd({
        requestedCwd: path.resolve('/repo/src'),
        roleKey: 'coder',
        repoRoot: path.resolve('/repo'),
        isSwarmRole: true,
        fsImpl: mockFs,
      });
      expect(result.valid).toBe(false);
      expect(result.error).toContain('.devhub/worktrees');
    });

    test('rejects non-existent worktree', () => {
      const result = validateSwarmCwd({
        requestedCwd: path.resolve('/repo/.devhub/worktrees/launch-xxx/coder'),
        roleKey: 'coder',
        repoRoot: path.resolve('/repo'),
        isSwarmRole: true,
        fsImpl: { existsSync: () => false },
      });
      expect(result.valid).toBe(false);
      expect(result.error).toContain('does not exist');
    });

    test('rejects worktree without .git marker', () => {
      const result = validateSwarmCwd({
        requestedCwd: sampleCwd,
        roleKey: 'coder',
        repoRoot: path.resolve('/repo'),
        isSwarmRole: true,
        fsImpl: {
          existsSync: (p) => p === sampleCwd,
        },
      });
      expect(result.valid).toBe(false);
      expect(result.error).toContain('.git');
    });

    test('allows non-swarm roles to use any valid path', () => {
      const result = validateSwarmCwd({
        requestedCwd: path.resolve('/repo/src'),
        roleKey: 'shell',
        repoRoot: path.resolve('/repo'),
        isSwarmRole: false,
        fsImpl: { existsSync: () => true },
      });
      expect(result.valid).toBe(true);
    });
  });
});
