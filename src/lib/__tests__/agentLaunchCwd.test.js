const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const { buildAgentLaunchWrapper } = require('../agentLaunchWrapper');
const { buildAgentLaunchCommand } = require('../agentLaunchCommand');
// buildTmuxWrappedCommand lives in the browser-safe shared module now.
const {
  buildTmuxWrappedCommand,
  resolveAgentProgramExecutable,
} = require('../agentLaunchCommand.shared');
const { toBashAccessiblePath } = require('../operations/materializeLaunchWrapper');

// Host-dependent: env override / ~/.opencode/bin / bare PATH fallback.
const OPENCODE_BIN = resolveAgentProgramExecutable('opencode');

// bash may be missing on Windows hosts without WSL/Git Bash — skip syntax checks there.
const hasBash = (() => {
  try {
    return spawnSync('bash', ['-c', 'true']).status === 0;
  } catch {
    return false;
  }
})();
const testWithBash = hasBash ? test : test.skip;

describe('agentLaunchCwd — REQ-CWD-1/2/3', () => {
  const baseParams = {
    agentId: 'launch-abc-coder',
    missionId: 'launch-abc',
    role: 'coder',
    workspacePath: '/repo/.devhub/worktrees/launch-abc/coder',
    workspaceId: 'ws-123',
    runId: 'run-456',
    supervisorUrl: 'http://localhost:3000',
    innerCommand: 'opencode --agent gentle-orchestrator --prompt "do work"',
  };

  describe('REQ-CWD-3: Fail-fast on missing worktree', () => {
    const wp = '/repo/.devhub/worktrees/launch-abc/coder';

    test('wrapper includes directory existence check before cd', () => {
      const result = buildAgentLaunchWrapper(baseParams);
      expect(result).toContain('if [ ! -d "$DEVHUB_WORKSPACE_PATH" ]; then');
      expect(result).toContain('Worktree path does not exist');
      expect(result).toContain('exit 1');
      expect(result).toContain(`DEVHUB_WORKSPACE_PATH_RAW='${wp}'`);
      expect(result).toContain('_devhub_to_bash_path');
    });

    test('path validation appears BEFORE cd command', () => {
      const result = buildAgentLaunchWrapper(baseParams);
      const validationIdx = result.indexOf('if [ ! -d "$DEVHUB_WORKSPACE_PATH" ]; then');
      const cdIdx = result.indexOf('cd "$DEVHUB_WORKSPACE_PATH"');
      expect(validationIdx).toBeGreaterThan(-1);
      expect(cdIdx).toBeGreaterThan(-1);
      expect(validationIdx).toBeLessThan(cdIdx);
    });

    test('Windows worktree paths are resolved for WSL/Git Bash at runtime', () => {
      const winPath = 'D:\\devhub\\.devhub\\worktrees\\launch-abc\\coder';
      const result = buildAgentLaunchWrapper({ ...baseParams, workspacePath: winPath });
      expect(result).toContain('_devhub_to_bash_path');
      expect(result).toContain('/mnt/');
      expect(result).toContain('DEVHUB_WORKSPACE_PATH_RAW=');
      expect(result).not.toContain(`if [ ! -d "${winPath}" ]`);
    });
  });

  describe('REQ-CWD-1: Explicit cd in agent wrapper', () => {
    test('wrapper includes cd to resolved DEVHUB_WORKSPACE_PATH', () => {
      const result = buildAgentLaunchWrapper(baseParams);
      expect(result).toContain('cd "$DEVHUB_WORKSPACE_PATH"');
    });

    test('cd includes fallback error on failure', () => {
      const result = buildAgentLaunchWrapper(baseParams);
      expect(result).toContain('Failed to cd into worktree');
    });

    test('cd appears BEFORE identity verification block', () => {
      const result = buildAgentLaunchWrapper(baseParams);
      const cdIdx = result.indexOf('cd "$DEVHUB_WORKSPACE_PATH"');
      const identityIdx = result.indexOf('==========');
      expect(cdIdx).toBeGreaterThan(-1);
      expect(identityIdx).toBeGreaterThan(-1);
      expect(cdIdx).toBeLessThan(identityIdx);
    });

    test('order is: path validation → cd → identity verification', () => {
      const result = buildAgentLaunchWrapper(baseParams);
      const validationIdx = result.indexOf('if [ ! -d "$DEVHUB_WORKSPACE_PATH" ]; then');
      const cdIdx = result.indexOf('cd "$DEVHUB_WORKSPACE_PATH"');
      const identityIdx = result.indexOf('==========');
      expect(validationIdx).toBeLessThan(cdIdx);
      expect(cdIdx).toBeLessThan(identityIdx);
    });
  });

  describe('REQ-CWD-2: Tmux session CWD flag', () => {
    test('buildTmuxWrappedCommand with cwd uses tmux -c start directory', () => {
      const cwd = '/repo/.devhub/worktrees/launch-abc/coder';
      const result = buildTmuxWrappedCommand('echo hello', 'sess-1', cwd);
      // Inner command runs as a child + `exec zsh` keeps the session alive.
      expect(result).toContain(
        `tmux new-session -A -d -s 'sess-1' -c '${cwd}' '(echo hello); exec zsh'`
      );
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

    test('buildAgentLaunchCommand can skip tmux wrapping when the terminal is already tmux-backed', () => {
      const result = buildAgentLaunchCommand('opencode', 'do work', {
        opencodeAgent: 'swarm-director',
        modelId: 'minimax-coding-plan/MiniMax-M3',
        tmuxSessionName: 'sess-test',
        disableTmuxWrap: true,
      });

      expect(result).toContain(`${OPENCODE_BIN} --agent swarm-director`);
      expect(result).toContain('--model minimax-coding-plan/MiniMax-M3');
      expect(result).not.toContain('tmux new-session');
      expect(result).not.toContain('tmux attach-session');
    });

    test('buildAgentLaunchCommand can start interactive OpenCode without --prompt for post-launch bootstrap', () => {
      const result = buildAgentLaunchCommand('opencode', 'do work', {
        opencodeAgent: 'swarm-director',
        modelId: 'minimax-coding-plan/MiniMax-M3',
        interactiveBootstrapPrompt: true,
      });

      expect(result).toContain(`${OPENCODE_BIN} --agent swarm-director`);
      expect(result).toContain('--model minimax-coding-plan/MiniMax-M3');
      expect(result).not.toContain('--prompt');
    });

    test('buildAgentLaunchCommand starts agy bare (no prompt flag) for post-launch bootstrap (W8)', () => {
      const AGY_BIN = resolveAgentProgramExecutable('agy');
      for (const programId of ['agy', 'antigravity']) {
        const result = buildAgentLaunchCommand(programId, 'do work', {
          tmuxSessionName: 'sess-test',
          interactiveBootstrapPrompt: true,
        });
        // Antigravity launches its interactive TUI bare; the swarm prompt is
        // injected post-launch via tmux send-keys, so no prompt flag is assumed.
        expect(result).toContain(AGY_BIN);
        expect(result).not.toContain('--prompt');
      }
    });

    test('buildAgentLaunchCommand does not inherit SDD session injection from env', () => {
      const original = process.env.SDD_ENABLED;
      process.env.SDD_ENABLED = 'true';

      try {
        const result = buildAgentLaunchCommand('opencode', 'do work', {
          opencodeAgent: 'swarm-director',
          interactiveBootstrapPrompt: true,
        });

        expect(result).not.toContain('--session ');
      } finally {
        if (original === undefined) {
          delete process.env.SDD_ENABLED;
        } else {
          process.env.SDD_ENABLED = original;
        }
      }
    });

    test('buildAgentLaunchCommand includes --session when SDD is explicitly enabled', async () => {
      const originalFetch = global.fetch;
      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ isError: false, content: [{ text: 'ok' }] }),
      });

      try {
        const result = buildAgentLaunchCommand('opencode', 'do work', {
          opencodeAgent: 'swarm-director',
          interactiveBootstrapPrompt: true,
          sddEnabled: true,
          agentId: 'launch-abc-coder',
          sessionId: 'ses_explicit_123',
        });

        expect(result).toContain('--session ses_explicit_123');
        await Promise.resolve();
      } finally {
        if (originalFetch === undefined) {
          delete global.fetch;
        } else {
          global.fetch = originalFetch;
        }
      }
    });

    test('buildTmuxWrappedCommand safely escapes embedded single quotes', () => {
      const result = buildTmuxWrappedCommand(
        `printf '%s\n' 'hello'`,
        'sess-quote',
        "/tmp/agent's-worktree"
      );
      expect(result).toContain(`-s 'sess-quote'`);
      // shellQuote escapes embedded quotes as '\'' (POSIX style).
      expect(result).toContain(`-c '/tmp/agent'\\''s-worktree'`);
      expect(result).toContain(`'(printf '\\''%s\n'\\'' '\\''hello'\\''); exec zsh'`);
    });
  });

  describe('Single-quote escaping in HEARTBEAT_PAYLOAD (zsh:44 fix)', () => {
    test('HEARTBEAT_PAYLOAD uses cwd placeholder; workspace apostrophes live in RAW export', () => {
      const paramsWithQuote = {
        ...baseParams,
        workspacePath: "/repo/.devhub/worktrees/launch-abc/coder's-workspace",
        role: 'coder',
      };
      const result = buildAgentLaunchWrapper(paramsWithQuote);
      const heartbeatLine = result.split('\n').find((l) => l.startsWith('HEARTBEAT_PAYLOAD='));
      expect(heartbeatLine).toBeDefined();
      expect(heartbeatLine).toContain('__DEVHUB_CWD__');
      expect(result).toContain('sed "s|__DEVHUB_CWD__|$DEVHUB_WORKSPACE_PATH|g"');
      // Apostrophe path is single-quote-escaped in the bootstrap RAW assignment
      expect(result).toContain(
        "DEVHUB_WORKSPACE_PATH_RAW='/repo/.devhub/worktrees/launch-abc/coder'\\''s-workspace'"
      );
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

    testWithBash('wrapper script is valid bash when payload has single quotes', () => {
      const paramsWithQuote = {
        ...baseParams,
        workspacePath: "/tmp/agent's-space",
        role: "tester's-role",
        innerCommand: 'echo "hello"',
      };
      const result = buildAgentLaunchWrapper(paramsWithQuote);
      // The script should have balanced quotes — parse it with bash -n.
      // Write to a temp file instead of inlining a heredoc on the command
      // line (Windows cmd has an 8191-char limit and chokes on the wrapper).
      const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'devhub-cwd-test-'));
      const tmpFile = path.join(tmpDir, 'wrapper.sh');
      try {
        fs.writeFileSync(tmpFile, result, { mode: 0o644 });
        const check = spawnSync('bash', ['-n', toBashAccessiblePath(tmpFile)], {
          encoding: 'utf8',
        });
        if (check.status !== 0) {
          throw new Error(`Generated wrapper is invalid bash: ${check.stderr}\nScript:\n${result}`);
        }
      } finally {
        fs.rmSync(tmpDir, { recursive: true, force: true });
      }
    });

    test('wrapper can bootstrap the initial prompt into an interactive OpenCode session', () => {
      const result = buildAgentLaunchWrapper({
        ...baseParams,
        innerCommand: `${OPENCODE_BIN} --agent swarm-director --model minimax-coding-plan/MiniMax-M3`,
        bootstrapPrompt: 'Rol: Director\nMisión: prueba',
      });

      // T2.2 contract: chunked single-shot paste targeting ${_tmux_target},
      // gated behind the viewport-ready wait (no fixed sleep anymore).
      expect(result).toContain('_devhub_bootstrap_prompt()');
      expect(result).toContain('_devhub_wait_viewport_ready');
      expect(result).toContain("tmux load-buffer - <<'DEVHUB_BOOTSTRAP_PROMPT'");
      expect(result).toContain('tmux paste-buffer -d -t "${_tmux_target}"');
      expect(result).toContain('tmux send-keys -t "${_tmux_target}" C-m');
      expect(result).toContain('Rol: Director\nMisión: prueba');
    });
  });
});
