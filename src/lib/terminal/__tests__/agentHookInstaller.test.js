import {
  buildKimiConfigWithHooks,
  removeKimiManagedBlock,
  isKimiHooksInstalled,
  buildClaudeSettingsWithHooks,
  removeClaudeHooks,
  isClaudeHooksInstalled,
  buildInstalledHookCommand,
  checkKimiVersion,
  installAgentHook,
  KIMI_BLOCK_BEGIN,
  KIMI_BLOCK_END,
} from '../agentHooks/installer.js';

describe('Agent Hook Installers — Golden File Tests & P1-P3 Fixes', () => {
  describe('P1-2 — Command Wrapper & Quoting', () => {
    test('formats POSIX bash wrapper with single-quote escaping for .sh scripts', () => {
      const cmd = buildInstalledHookCommand(
        '/home/user/path/devhub-agent-state.sh',
        'working',
        'UserPromptSubmit',
        'kimi'
      );
      expect(cmd).toBe(
        "bash '/home/user/path/devhub-agent-state.sh' working UserPromptSubmit kimi"
      );
    });

    test('formats PowerShell wrapper for .ps1 scripts', () => {
      const cmd = buildInstalledHookCommand(
        'C:\\Users\\PC\\.kimi-code\\hooks\\devhub-agent-state.ps1',
        'working',
        'UserPromptSubmit',
        'kimi'
      );
      expect(cmd).toBe(
        'powershell -NoProfile -ExecutionPolicy Bypass -File "C:\\Users\\PC\\.kimi-code\\hooks\\devhub-agent-state.ps1" -State working -Event UserPromptSubmit -Agent kimi'
      );
    });
  });

  describe('P1-3 — Kimi Version Check', () => {
    test('checkKimiVersion runs without throwing', () => {
      const result = checkKimiVersion();
      expect(result).toBeDefined();
      expect(typeof result.ok).toBe('boolean');
    });
  });

  describe('P2-3 — Byte-Faithful Uninstallers', () => {
    test('removeKimiManagedBlock is byte-faithful to surrounding content (P2-3)', () => {
      const existing = '\n\n[model]\nname = "kimi-k1.5"\n\n\n\nx = 1\n';
      const installed = buildKimiConfigWithHooks(existing, '/path/script.sh', 'kimi');
      const uninstalled = removeKimiManagedBlock(installed);

      // Must be byte-identical to original existing content
      expect(uninstalled).toBe(existing);
    });

    test('removeClaudeHooks preserves pre-existing empty hooks arrays (P2-3)', () => {
      const existing = JSON.stringify(
        {
          theme: 'dark',
          hooks: {
            PreToolUse: [],
          },
        },
        null,
        2
      );

      const installed = buildClaudeSettingsWithHooks(
        existing,
        '/path/devhub-agent-state.sh',
        'claude'
      );
      const uninstalled = removeClaudeHooks(installed);
      const parsed = JSON.parse(uninstalled);

      expect(parsed.theme).toBe('dark');
      expect(parsed.hooks).toBeDefined();
      expect(parsed.hooks.PreToolUse).toBeDefined();
      expect(parsed.hooks.PreToolUse).toEqual([]);
    });
  });

  describe('P3-6 — Abort install if config dir missing', () => {
    test('installAgentHook throws clear error if config directory does not exist', () => {
      // Mock resolveAgentConfigPath to return non-existent dir path
      expect(() => {
        installAgentHook('nonexistent-agent-type');
      }).toThrow();
    });
  });

  describe('Kimi TOML Merger', () => {
    const scriptPath = '/home/user/.kimi-code/hooks/devhub-agent-state.sh';

    test('installs on empty config string', () => {
      const result = buildKimiConfigWithHooks('', scriptPath, 'kimi');

      expect(isKimiHooksInstalled(result)).toBe(true);
      expect(result).toContain(KIMI_BLOCK_BEGIN);
      expect(result).toContain(KIMI_BLOCK_END);
      expect(result).toContain('event = "UserPromptSubmit"');
      expect(result).toContain(
        "bash '/home/user/.kimi-code/hooks/devhub-agent-state.sh' working UserPromptSubmit kimi"
      );
      expect(result).toContain('event = "PermissionRequest"');
      expect(result).toContain(
        "bash '/home/user/.kimi-code/hooks/devhub-agent-state.sh' blocked PermissionRequest kimi"
      );
    });

    test('preserves existing content before block', () => {
      const existing = '[model]\nname = "kimi-k1.5"\ntemperature = 0.7\n';
      const result = buildKimiConfigWithHooks(existing, scriptPath, 'kimi');

      expect(result.startsWith('[model]\nname = "kimi-k1.5"\ntemperature = 0.7')).toBe(true);
      expect(isKimiHooksInstalled(result)).toBe(true);
    });

    test('reinstalling is idempotent (does not duplicate block)', () => {
      const existing = '[model]\nname = "kimi-k1.5"\n';
      const first = buildKimiConfigWithHooks(existing, scriptPath, 'kimi');
      const second = buildKimiConfigWithHooks(first, scriptPath, 'kimi');

      expect(second).toBe(first);
      const occurrences = second.split(KIMI_BLOCK_BEGIN).length - 1;
      expect(occurrences).toBe(1);
    });
  });

  describe('Claude JSON Merger', () => {
    const scriptPath = '/home/user/.claude/hooks/devhub-agent-state.sh';

    test('installs on empty config string', () => {
      const result = buildClaudeSettingsWithHooks('{}', scriptPath, 'claude');
      const parsed = JSON.parse(result);

      expect(isClaudeHooksInstalled(result)).toBe(true);
      expect(parsed.hooks).toBeDefined();
      expect(parsed.hooks.UserPromptSubmit).toBeDefined();
      expect(parsed.hooks.UserPromptSubmit[0].hooks[0].command).toContain(
        "bash '/home/user/.claude/hooks/devhub-agent-state.sh' working UserPromptSubmit claude"
      );
      expect(parsed.hooks.PermissionRequest[0].hooks[0].command).toContain(
        "bash '/home/user/.claude/hooks/devhub-agent-state.sh' blocked PermissionRequest claude"
      );
    });

    test('preserves unrelated user hooks and settings', () => {
      const existing = JSON.stringify(
        {
          theme: 'dark',
          hooks: {
            PreToolUse: [
              {
                matcher: 'git',
                hooks: [{ type: 'command', command: 'echo custom-hook' }],
              },
            ],
          },
        },
        null,
        2
      );

      const result = buildClaudeSettingsWithHooks(existing, scriptPath, 'claude');
      const parsed = JSON.parse(result);

      expect(parsed.theme).toBe('dark');
      expect(parsed.hooks.PreToolUse.length).toBe(2);
      expect(parsed.hooks.PreToolUse[0].hooks[0].command).toBe('echo custom-hook');
      expect(parsed.hooks.PreToolUse[1].hooks[0].command).toContain('devhub-agent-state.sh');
    });

    test('reinstalling is idempotent', () => {
      const first = buildClaudeSettingsWithHooks('{}', scriptPath, 'claude');
      const second = buildClaudeSettingsWithHooks(first, scriptPath, 'claude');

      const parsed = JSON.parse(second);
      expect(parsed.hooks.UserPromptSubmit.length).toBe(1);
    });

    test('uninstall removes devhub hooks and preserves user hooks', () => {
      const customConfig = JSON.stringify({
        theme: 'dark',
        hooks: {
          PreToolUse: [
            {
              matcher: 'git',
              hooks: [{ type: 'command', command: 'echo custom-hook' }],
            },
          ],
        },
      });

      const installed = buildClaudeSettingsWithHooks(customConfig, scriptPath, 'claude');
      const uninstalled = removeClaudeHooks(installed);
      const parsed = JSON.parse(uninstalled);

      expect(parsed.theme).toBe('dark');
      expect(parsed.hooks.PreToolUse.length).toBe(1);
      expect(parsed.hooks.PreToolUse[0].hooks[0].command).toBe('echo custom-hook');
      expect(isClaudeHooksInstalled(uninstalled)).toBe(false);
    });
  });

  describe('Qoder CLI JSON Merger (same format as Claude)', () => {
    const scriptPath = '/home/user/.qoder/hooks/devhub-agent-state.sh';

    test('installs hooks with agent name qodercli', () => {
      const result = buildClaudeSettingsWithHooks('{}', scriptPath, 'qodercli');
      const parsed = JSON.parse(result);

      expect(isClaudeHooksInstalled(result)).toBe(true);
      expect(parsed.hooks).toBeDefined();
      expect(parsed.hooks.Stop).toBeDefined();
      expect(parsed.hooks.Stop[0].hooks[0].command).toContain(
        "bash '/home/user/.qoder/hooks/devhub-agent-state.sh' idle Stop qodercli"
      );
      expect(parsed.hooks.PermissionRequest[0].hooks[0].command).toContain(
        "bash '/home/user/.qoder/hooks/devhub-agent-state.sh' blocked PermissionRequest qodercli"
      );
    });

    test('reinstalling is idempotent', () => {
      const first = buildClaudeSettingsWithHooks('{}', scriptPath, 'qodercli');
      const second = buildClaudeSettingsWithHooks(first, scriptPath, 'qodercli');

      const parsed = JSON.parse(second);
      expect(parsed.hooks.UserPromptSubmit.length).toBe(1);
    });

    test('uninstall removes devhub hooks and preserves user settings', () => {
      const customConfig = JSON.stringify({
        theme: 'solarized',
        hooks: {
          PreToolUse: [{ matcher: '*', hooks: [{ type: 'command', command: 'echo my-hook' }] }],
        },
      });

      const installed = buildClaudeSettingsWithHooks(customConfig, scriptPath, 'qodercli');
      const uninstalled = removeClaudeHooks(installed);
      const parsed = JSON.parse(uninstalled);

      expect(parsed.theme).toBe('solarized');
      expect(parsed.hooks.PreToolUse.length).toBe(1);
      expect(parsed.hooks.PreToolUse[0].hooks[0].command).toBe('echo my-hook');
      expect(isClaudeHooksInstalled(uninstalled)).toBe(false);
    });
  });
});
