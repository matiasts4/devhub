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
    test('buildTmuxWrappedCommand with cwd uses tmux -c start directory', () => {
      const cwd = '/repo/.devhub/worktrees/launch-abc/coder';
      const result = buildTmuxWrappedCommand('echo hello', 'sess-1', cwd);
      expect(result).toContain(`tmux new-session -A -d -s 'sess-1' -c '${cwd}' 'echo hello'`);
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
      expect(result).toContain(`-c '/repo/.devhub/worktrees/launch-abc/coder'`);
    });

    test('buildAgentLaunchCommand without cwd is backward compatible', () => {
      const result = buildAgentLaunchCommand('hermes', 'do work', {
        tmuxSessionName: 'sess-test',
      });
      expect(result).toContain('tmux new-session');
      expect(result).not.toContain('cd "');
    });

    test('buildTmuxWrappedCommand safely escapes embedded single quotes', () => {
      const result = buildTmuxWrappedCommand(
        `printf '%s\n' 'hello'`,
        'sess-quote',
        "/tmp/agent's-worktree"
      );
      expect(result).toContain(`-s 'sess-quote'`);
      expect(result).toContain(`-c '/tmp/agent'"'"'s-worktree'`);
      expect(result).toContain(`'printf '"'"'%s\n'"'"' '"'"'hello'"'"''`);
    });
  });

  describe('Single-quote escaping in HEARTBEAT_PAYLOAD (zsh:44 fix)', () => {
    test('HEARTBEAT_PAYLOAD escapes single quotes in workspacePath', () => {
      const paramsWithQuote = {
        ...baseParams,
        workspacePath: "/repo/.devhub/worktrees/launch-abc/coder's-workspace",
        role: 'coder',
      };
      const result = buildAgentLaunchWrapper(paramsWithQuote);
      // The heartbeat line must exist and contain the escaped quote
      const heartbeatLine = result.split('\n').find((l) => l.startsWith('HEARTBEAT_PAYLOAD='));
      expect(heartbeatLine).toBeDefined();
      // In the JSON representation, \' appears as \\' (backslash escaped)
      expect(heartbeatLine).toContain("\\'");
    });

    test('HEARTBEAT_PAYLOAD escapes single quotes in role', () => {
      const paramsWithQuote = {
        ...baseParams,
        role: "dev's-assistant",
      };
      const result = buildAgentLaunchWrapper(paramsWithQuote);
      const heartbeatLine = result.split('\n').find((l) => l.startsWith('HEARTBEAT_PAYLOAD='));
      expect(heartbeatLine).toBeDefined();
      expect(heartbeatLine).toContain("\\'");
    });

    test('wrapper script is valid bash when payload has single quotes', () => {
      const paramsWithQuote = {
        ...baseParams,
        workspacePath: "/tmp/agent's-space",
        role: "tester's-role",
        innerCommand: 'echo "hello"',
      };
      const result = buildAgentLaunchWrapper(paramsWithQuote);
      // The script should have balanced quotes — parse it with bash -n
      // This verifies the fix doesn't introduce new quoting issues
      const { execSync } = require('child_process');
      try {
        execSync(`bash -n <<'SCRIPT'\n${result}\nSCRIPT`, { encoding: 'utf8' });
      } catch (err) {
        throw new Error(`Generated wrapper is invalid bash: ${err.message}\nScript:\n${result}`);
      }
    });
  });
});
