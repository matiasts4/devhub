/**
 * Unit tests for agentLaunchWrapper
 */

const {
  buildAgentEnvExports,
  buildIdentityVerificationBlock,
  buildInitialHeartbeatCommand,
  buildExitTrapCommand,
  buildAgentLaunchWrapper,
  buildDirectorTmuxInjection,
  buildAutoRestartLoopCommand,
} = require('../agentLaunchWrapper');

describe('agentLaunchWrapper', () => {
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

  describe('buildAgentEnvExports', () => {
    test('exports all required DEVHUB_ variables', () => {
      const result = buildAgentEnvExports(baseParams);
      expect(result).toContain('DEVHUB_AGENT_ID="launch-abc-coder"');
      expect(result).toContain('DEVHUB_MISSION_ID="launch-abc"');
      expect(result).toContain('DEVHUB_ROLE="coder"');
      expect(result).toContain('DEVHUB_WORKSPACE_PATH="/repo/.devhub/worktrees/launch-abc/coder"');
      expect(result).toContain('DEVHUB_WORKSPACE_ID="ws-123"');
      expect(result).toContain('DEVHUB_RUN_ID="run-456"');
    });

    test('includes supervisor URL when provided', () => {
      const result = buildAgentEnvExports(baseParams);
      expect(result).toContain('DEVHUB_SUPERVISOR_URL="http://localhost:3000"');
    });

    test('omits supervisor URL when not provided', () => {
      const result = buildAgentEnvExports({ ...baseParams, supervisorUrl: undefined });
      expect(result).not.toContain('DEVHUB_SUPERVISOR_URL');
    });

    test('does NOT mention Plyrium', () => {
      const result = buildAgentEnvExports(baseParams);
      expect(result).not.toContain('plyrium');
      expect(result).not.toContain('Plyrium');
    });
  });

  describe('buildIdentityVerificationBlock', () => {
    test('prints identity and cwd verification', () => {
      const result = buildIdentityVerificationBlock(baseParams);
      expect(result).toContain('DEVHUB_AGENT_ID=launch-abc-coder');
      expect(result).toContain('DEVHUB_ROLE=coder');
      expect(result).toContain('Current directory:');
    });

    test('includes cwd mismatch check', () => {
      const result = buildIdentityVerificationBlock(baseParams);
      expect(result).toContain('cwd mismatch');
      expect(result).toContain('ABORTING');
      expect(result).toContain('exit 1');
    });

    test('does NOT mention Plyrium', () => {
      const result = buildIdentityVerificationBlock(baseParams);
      expect(result).not.toContain('plyrium');
    });
  });

  describe('buildInitialHeartbeatCommand', () => {
    test('returns curl command with correct payload', () => {
      const result = buildInitialHeartbeatCommand(baseParams);
      expect(result).toContain('curl');
      expect(result).toContain('/api/agenthub/presence/heartbeat');
      expect(result).toContain('launch-abc-coder');
      expect(result).toContain('idle');
    });

    test('returns comment when no supervisor URL', () => {
      const result = buildInitialHeartbeatCommand({ ...baseParams, supervisorUrl: undefined });
      expect(result).toContain('# Heartbeat skipped');
    });
  });

  describe('buildExitTrapCommand', () => {
    test('returns trap command with process_exit event', () => {
      const result = buildExitTrapCommand(baseParams);
      expect(result).toContain('trap');
      expect(result).toContain('process_exit');
      expect(result).toContain('EXIT');
    });

    // T-014: supervisorUrl is no longer required — the bus is the new path.
    // The trap is installed unconditionally; the runtime guard on
    // DEVHUB_MISSION_ID/DEVHUB_AGENT_ID decides whether the bus event fires.
    test('emits the trap even when no supervisor URL is provided (T-014)', () => {
      const result = buildExitTrapCommand({ ...baseParams, supervisorUrl: undefined });
      expect(result).toContain('trap _devhub_exit_handler EXIT');
      expect(result).toContain('event-write');
      // runtime guard still in place
      expect(result).toContain('DEVHUB_MISSION_ID');
      expect(result).toContain('DEVHUB_AGENT_ID');
    });
  });

  describe('buildAgentLaunchWrapper', () => {
    test('generates complete script with all sections', () => {
      const result = buildAgentLaunchWrapper(baseParams);
      expect(result).toContain('#!/usr/bin/env bash');
      expect(result).toContain('DEVHUB_AGENT_ID');
      expect(result).toContain('Current directory:');
      expect(result).toContain('curl');
      expect(result).toContain('trap');
      expect(result).toContain(baseParams.innerCommand);
    });

    test('does NOT use Plyrium as runtime command', () => {
      const result = buildAgentLaunchWrapper(baseParams);
      // The word "Plyrium" may appear in comments explaining what we DON'T do,
      // but it must NOT appear as a command or executable
      expect(result).not.toMatch(/plyrium\s+(team-spawn|worktree-add|agent-status)/i);
      expect(result).not.toMatch(/`plyrium/i);
    });

    test('includes inner command and logging', () => {
      const result = buildAgentLaunchWrapper(baseParams);
      expect(result).toContain(baseParams.innerCommand);
      expect(result).toContain('Inner command exited with code');
    });
  });

  describe('buildAutoRestartLoopCommand', () => {
    test('includes max restarts limit of 3', () => {
      const result = buildAutoRestartLoopCommand({ innerCommand: 'opencode' });
      expect(result).toContain('MAX_RESTARTS=3');
    });

    test('includes 5 second restart delay', () => {
      const result = buildAutoRestartLoopCommand({ innerCommand: 'opencode' });
      expect(result).toContain('RESTART_DELAY=5');
    });

    test('restarts on non-zero exit code', () => {
      const result = buildAutoRestartLoopCommand({ innerCommand: 'opencode' });
      expect(result).toContain('if [ ${AGENT_EXIT_CODE} -ne 0 ]');
      expect(result).toContain('_devhub_restart_if_needed');
    });

    test('exits after max restarts reached', () => {
      const result = buildAutoRestartLoopCommand({ innerCommand: 'opencode' });
      expect(result).toContain('if [ "$_devhub_RESTART_COUNT" -ge "$MAX_RESTARTS" ]');
      expect(result).toContain('exit 1');
    });

    test('increments restart counter', () => {
      const result = buildAutoRestartLoopCommand({ innerCommand: 'opencode' });
      expect(result).toContain('_devhub_RESTART_COUNT=$((_devhub_RESTART_COUNT + 1))');
    });
  });

  describe('buildDirectorTmuxInjection (T-006 shim — HMAC removed)', () => {
    test('returns empty script if no director session name provided', () => {
      const result = buildDirectorTmuxInjection(null);
      expect(result).toContain('# _devhub_tell_director skipped');
    });

    test('shim defines _devhub_tell_director that delegates to _devhub_chat (T-006)', () => {
      const result = buildDirectorTmuxInjection('devhub-swarm-123-director');
      expect(result).toContain('_devhub_tell_director()');
      expect(result).toContain('_devhub_chat');
      expect(result).toMatch(/WARN/i);
      expect(result).toContain('deprecated');
    });

    test('shim does NOT contain HMAC or circuit breaker (HMAC removed in T-006)', () => {
      const result = buildDirectorTmuxInjection('devhub-swarm-123-director');
      expect(result).not.toMatch(/openssl dgst -sha256 -hmac/);
      expect(result).not.toMatch(/_circuit_file/);
      expect(result).not.toMatch(/_max_retries/);
    });

    test('shim honors DEVHUB_INBOX_SHIM_DISABLED=true (emergency cutover)', () => {
      const result = buildDirectorTmuxInjection('devhub-swarm-123-director');
      expect(result).toContain('DEVHUB_INBOX_SHIM_DISABLED');
    });
  });

  // =========================================================================
  // T-016.3: MCP opt-out for swarm agents.
  //
  // The minimax MCP env vars (ANTHROPIC_BASE_URL / ANTHROPIC_MODEL /
  // ANTHROPIC_AUTH_TOKEN) are for the user's Zed session — a personal tool.
  // They must NOT be injected into swarm agents, which should run on the
  // default anthropic provider (or whatever the host already uses).
  //
  // Two opt-out mechanisms:
  //   (a) explicit `disableMinimaxMcp: true` param on buildAgentEnvExports /
  //       buildAgentLaunchWrapper
  //   (b) env var `DEVHUB_AGENT_DISABLE_MINIMAX_MCP=1` (escape hatch for
  //       batch launches / one-off CLI calls that don't go through route.js)
  //
  // Backward compat: existing callers that don't pass `disableMinimaxMcp`
  // AND don't set the env var get the OLD behavior (MCP injection for
  // modelProvider === 'minimax'). This keeps the Zed session working.
  //
  // Test approach: we mock the llmProviderConfig module so the test is
  // deterministic (the real sync reader is broken under jest babel
  // transform — `fs/promises` default-export issue — pre-existing bug,
  // not something T-016 introduces). All three tests use the same mock
  // base; they differ only in which opt-out knob is active. This is a
  // parametric test of the "opt-out" code path.
  // =========================================================================
  describe('T-016.3: minimax MCP opt-out for swarm agents', () => {
    let buildAgentEnvExportsMocked;
    beforeEach(() => {
      jest.resetModules();
      jest.doMock('../llmProviderConfig', () => ({
        getLlmProviderConfigSync: () => ({
          ANTHROPIC_BASE_URL: 'https://api.minimax.example/anthropic',
          MINIMAX_MODEL: 'minimax-test-mock',
        }),
      }));
      // eslint-disable-next-line global-require
      buildAgentEnvExportsMocked = require('../agentLaunchWrapper').buildAgentEnvExports;
    });

    afterEach(() => {
      jest.dontMock('../llmProviderConfig');
    });

    test('BASELINE: when no opt-out is set, MCP env vars ARE exported (backward compat for Zed)', () => {
      const prev = process.env.DEVHUB_AGENT_DISABLE_MINIMAX_MCP;
      delete process.env.DEVHUB_AGENT_DISABLE_MINIMAX_MCP;
      try {
        const result = buildAgentEnvExportsMocked({ ...baseParams, modelProvider: 'minimax' });
        // Backward compat: the minimax MCP env vars ARE exported. This is
        // what the user's personal Zed session depends on.
        expect(result).toMatch(/^export ANTHROPIC_BASE_URL=/m);
        expect(result).toMatch(/^export ANTHROPIC_MODEL=/m);
      } finally {
        if (prev !== undefined) process.env.DEVHUB_AGENT_DISABLE_MINIMAX_MCP = prev;
      }
    });

    test('when disableMinimaxMcp=true the wrapper does NOT set ANTHROPIC_BASE_URL even for modelProvider=minimax', () => {
      const result = buildAgentEnvExportsMocked({
        ...baseParams,
        modelProvider: 'minimax',
        disableMinimaxMcp: true,
      });
      // The opt-out must remove the MCP injection — ANTHROPIC_BASE_URL must
      // not be exported by us. (It may still be in the host env, but we are
      // not exporting it from the wrapper.)
      expect(result).not.toMatch(/^export ANTHROPIC_BASE_URL=/m);
      expect(result).not.toMatch(/^export ANTHROPIC_MODEL=.*minimax/m);
    });

    test('when DEVHUB_AGENT_DISABLE_MINIMAX_MCP=1 is in env, the wrapper skips MCP injection even with modelProvider=minimax', () => {
      const prev = process.env.DEVHUB_AGENT_DISABLE_MINIMAX_MCP;
      process.env.DEVHUB_AGENT_DISABLE_MINIMAX_MCP = '1';
      try {
        const result = buildAgentEnvExportsMocked({ ...baseParams, modelProvider: 'minimax' });
        expect(result).not.toMatch(/^export ANTHROPIC_BASE_URL=/m);
        expect(result).not.toMatch(/^export ANTHROPIC_MODEL=.*minimax/m);
      } finally {
        if (prev === undefined) delete process.env.DEVHUB_AGENT_DISABLE_MINIMAX_MCP;
        else process.env.DEVHUB_AGENT_DISABLE_MINIMAX_MCP = prev;
      }
    });
  });

  // =========================================================================
  // T-016.4: Per-agent transcript capture via tmux pipe-pane.
  //
  // Capture the LLM's full terminal output to a transcript file so the
  // user can review what each agent actually said/thought. This is the
  // durable evidence trail for swarm launches — needed because the
  // /tmp/devhub-swarm-<role>.log only captures wrapper diagnostics, not
  // the LLM's own output.
  //
  // Requirements:
  //   (a) Generated wrapper contains `tmux pipe-pane` and the transcript
  //       file path.
  //   (b) The exit trap removes the pipe-pane (or at least refers to it
  //       so the session is cleaned up).
  //   (c) Transcript file path matches /tmp/devhub-swarm-${role}.transcript
  //
  // The bootstrap prompt must also be written to the transcript before
  // the agent starts, so the user can see WHAT the agent was given.
  // =========================================================================
  describe('T-016.4: per-agent transcript capture via tmux pipe-pane', () => {
    const tmuxWrapperParams = {
      ...baseParams,
      tmuxSessionName: 'devhub-swarm-test-1-coder',
      bootstrapPrompt: 'Implement feature X with tests',
    };

    test('generated wrapper contains tmux pipe-pane and the transcript file path', () => {
      const result = buildAgentLaunchWrapper(tmuxWrapperParams);
      // The pipe-pane command must be emitted
      expect(result).toMatch(/tmux pipe-pane/);
      // The transcript file path must match the canonical template
      expect(result).toMatch(/\/tmp\/devhub-swarm-coder\.transcript/);
      // The pipe-pane must point at the transcript (not the .log file)
      expect(result).toMatch(/cat\s*>>\s*"?\$\{?DEVHUB_TRANSCRIPT[^"]*\}?\.transcript"?/);
    });

    test('exit trap removes the pipe-pane on agent exit (so the session is cleaned up)', () => {
      const result = buildAgentLaunchWrapper(tmuxWrapperParams);
      // The exit trap block (which already exists from T-014) must also
      // contain a pipe-pane removal. We look for the canonical
      // 'tmux pipe-pane -t <session> -o ""' or similar empty-target form.
      expect(result).toMatch(/tmux pipe-pane -t\s+"?\$\{?DEVHUB_TMUX_SESSION/);
      // Also: the wrapper does NOT use the old /tmp/devhub-swarm-<role>.log
      // as the pipe-pane target (that would conflate the transcript with
      // wrapper diagnostics).
      expect(result).not.toMatch(/cat\s*>>\s*"?\$\{?DEVHUB_LOG_FILE[^"]*\}?\.log"?[^.]*$/m);
    });

    test('transcript file path matches the canonical /tmp/devhub-swarm-${role}.transcript template', () => {
      const result = buildAgentLaunchWrapper(tmuxWrapperParams);
      // Must define DEVHUB_TRANSCRIPT_FILE or similar env var
      expect(result).toMatch(/DEVHUB_TRANSCRIPT[A-Z_]*=.*\.transcript/);
    });
  });
});
