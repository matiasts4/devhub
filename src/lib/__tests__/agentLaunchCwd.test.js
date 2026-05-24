const { buildAgentLaunchWrapper } = require('../agentLaunchWrapper');

const { buildTmuxWrappedCommand, buildAgentLaunchCommand } = require('../agentLaunchCommand');

describe('agentLaunchCwd — REQ-CWD-1/2/3', () => {
  const baseParams = {
    agentId: 'launch-abc-coder',
    missionId: 'launch-abc',
    role: 'coder',
    workspacePath: '/repo/.devhub/worktrees/launch-abc/coder',
    workspaceId: 'ws-123',
    runId: 'run-456',
    supervisorUrl: 'http://localhost:3000',
    innerCommand: 'opencode --agent sdd-orchestrator --prompt "do work"',
  };

  describe('REQ-CWD-3: Fail-fast on missing worktree', () => {
    const wp = '/repo/.devhub/worktrees/launch-abc/coder';

    test('wrapper includes directory existence check before cd', () => {
      const result = buildAgentLaunchWrapper(baseParams);
      expect(result).toContain(`if [ ! -d "${wp}" ]; then`);
      expect(result).toContain('Worktree path does not exist');
      expect(result).toContain('exit 1');
    });

    test('path validation appears BEFORE cd command', () => {
      const result = buildAgentLaunchWrapper(baseParams);
      const validationIdx = result.indexOf(`if [ ! -d "${wp}" ]; then`);
      const cdIdx = result.indexOf(`cd "${wp}"`);
      expect(validationIdx).toBeGreaterThan(-1);
      expect(cdIdx).toBeGreaterThan(-1);
      expect(validationIdx).toBeLessThan(cdIdx);
    });
  });

  describe('REQ-CWD-1: Explicit cd in agent wrapper', () => {
    const wp = '/repo/.devhub/worktrees/launch-abc/coder';

    test('wrapper includes cd to workspacePath', () => {
      const result = buildAgentLaunchWrapper(baseParams);
      expect(result).toContain(`cd "${wp}"`);
    });

    test('cd includes fallback error on failure', () => {
      const result = buildAgentLaunchWrapper(baseParams);
      expect(result).toContain('Failed to cd into worktree');
    });

    test('cd appears BEFORE identity verification block', () => {
      const result = buildAgentLaunchWrapper(baseParams);
      const cdIdx = result.indexOf(`cd "${wp}"`);
      const identityIdx = result.indexOf('==========');
      expect(cdIdx).toBeGreaterThan(-1);
      expect(identityIdx).toBeGreaterThan(-1);
      expect(cdIdx).toBeLessThan(identityIdx);
    });

    test('order is: path validation → cd → identity verification', () => {
      const result = buildAgentLaunchWrapper(baseParams);
      const validationIdx = result.indexOf(`if [ ! -d "${wp}" ]; then`);
      const cdIdx = result.indexOf(`cd "${wp}"`);
      const identityIdx = result.indexOf('==========');
      expect(validationIdx).toBeLessThan(cdIdx);
      expect(cdIdx).toBeLessThan(identityIdx);
    });
  });

  describe('REQ-CWD-2: Tmux session CWD flag', () => {
    test('buildTmuxWrappedCommand with cwd prefixes cd into command', () => {
      const cwd = '/repo/.devhub/worktrees/launch-abc/coder';
      const result = buildTmuxWrappedCommand('echo hello', 'sess-1', cwd);
      expect(result).toContain(`cd "${cwd}"`);
    });

    test('buildTmuxWrappedCommand without cwd remains backward compatible', () => {
      const result = buildTmuxWrappedCommand('echo hello', 'sess-1');
      expect(result).toContain('tmux new-session');
      expect(result).not.toContain('cd "');
    });

    test('buildAgentLaunchCommand passes workspacePath as cwd to tmux', () => {
      const result = buildAgentLaunchCommand('hermes', 'do work', {
        tmuxSessionName: 'sess-test',
        cwd: '/repo/.devhub/worktrees/launch-abc/coder',
      });
      expect(result).toContain('cd "/repo/.devhub/worktrees/launch-abc/coder"');
    });

    test('buildAgentLaunchCommand without cwd is backward compatible', () => {
      const result = buildAgentLaunchCommand('hermes', 'do work', {
        tmuxSessionName: 'sess-test',
      });
      expect(result).toContain('tmux new-session');
      expect(result).not.toContain('cd "');
    });
  });
});
