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

  // =========================================================================
  // T-017.1: director-consume in the director wrapper.
  //
  // The director has no push consumer, so it currently has to poll team_chat
  // for incoming worker messages. T-017.1 wires a background `director-consume`
  // process into the director wrapper that tails chat.jsonl and prints new
  // messages into the director's tmux pane in real time.
  //
  // Requirements:
  //   (a) The wrapper for the director role contains `director-consume` (the
  //       binary subcommand, NOT a comment-only mention).
  //   (b) The wrapper for a worker role does NOT contain `director-consume`.
  //   (c) The exit trap (which runs on agent exit) cleans up the consumer
  //       PID file so we don't leak processes when the director exits.
  //   (d) A 2-second sleep appears BEFORE the bootstrap prompt injection in
  //       the director wrapper — gives the consumer time to attach to the
  //       tmux pane before the director's TUI starts flooding with messages.
  // =========================================================================
  describe('T-017.1: director-consume in director wrapper', () => {
    const directorParams = {
      ...baseParams,
      role: 'director',
      tmuxSessionName: 'devhub-swarm-test-1-director',
      bootstrapPrompt: 'Coordinate the swarm',
      // busBinaryPath + dbPath are required for the bus helpers block
      // and the director consumer block to be emitted (otherwise the
      // wrapper emits "# Bus helpers skipped" / "# Director consumer
      // skipped" placeholders). The T-011 caller (route.js) always
      // passes these, so the production path is covered — the test
      // mirrors the production wiring.
      busBinaryPath: '/repo/devhub-cli/bin/devhub-bus.js',
      dbPath: '/repo/devhub.db',
    };

    test('director wrapper contains the director-consume subcommand invocation', () => {
      const result = buildAgentLaunchWrapper(directorParams);
      // Must invoke the subcommand (not just mention it in a comment)
      expect(result).toMatch(/director-consume/);
      // Must pass the target-session flag so the consumer knows which
      // tmux pane to print to
      expect(result).toContain('--target-session');
      // Must use tmux-send-keys format (we want the consumer to push
      // messages into the tmux pane, not just print to stdout)
      expect(result).toContain('tmux-send-keys');
    });

    test('worker wrapper does NOT contain director-consume (director-only hook)', () => {
      const workerParams = {
        ...baseParams,
        role: 'coder',
        tmuxSessionName: 'devhub-swarm-test-1-coder',
        busBinaryPath: '/repo/devhub-cli/bin/devhub-bus.js',
        dbPath: '/repo/devhub.db',
      };
      const result = buildAgentLaunchWrapper(workerParams);
      // The consumer is director-only. Workers don't tail chat.jsonl
      // for inbound messages — they use _devhub_inbox_check on demand.
      expect(result).not.toMatch(/director-consume/);
    });

    test('director wrapper exit trap cleans up the consumer PID file', () => {
      const result = buildAgentLaunchWrapper(directorParams);
      // The exit trap must contain PID file cleanup — without it we
      // leak a director-consume process every time the director exits.
      expect(result).toMatch(/devhub-director-consume-.*\.pid/);
      // Must call `kill` on the PID (or pkill, but kill is canonical)
      expect(result).toMatch(/kill\s+["`]?\$\(cat .*director-consume.*\.pid/);
    });

    test('director wrapper has a sleep before bootstrap prompt injection (lets consumer attach)', () => {
      const result = buildAgentLaunchWrapper(directorParams);
      // The 2s sleep before bootstrap prompt is director-specific — the
      // sleep gives director-consume time to attach to the tmux pane
      // before the bootstrap prompt is injected (avoids race condition
      // where consumer is still attaching when prompt arrives).
      expect(result).toMatch(/sleep 2[\s\S]{0,200}bootstrap|sleep 2[\s\S]{0,200}DEVHUB_BOOTSTRAP/);
    });
  });

  // =========================================================================
  // T-017.3: Bus-debug logs in the 4 bus helpers.
  //
  // When the auditor never wrote to the bus (launch-1751cfaa), debugging
  // required re-running the launch and adding prints. The fix: each of the
  // 4 bus helpers (_devhub_chat, _devhub_event, _devhub_presence,
  // _devhub_inbox_check) writes a structured debug line to
  // /tmp/devhub-swarm-<role>.bus-debug before and after the bus call.
  //
  // The log line must include:
  //   - timestamp
  //   - args summary
  //   - exit code (post-call)
  //
  // This is a STRUCTURED log (one line per event) so we can grep it
  // post-hoc to reconstruct what each agent tried to do.
  // =========================================================================
  describe('T-017.3: bus-debug logs in 4 bus helpers', () => {
    const debugParams = {
      ...baseParams,
      role: 'coder',
      tmuxSessionName: 'devhub-swarm-test-1-coder',
      bootstrapPrompt: 'Implement feature X with tests',
      busBinaryPath: '/repo/devhub-cli/bin/devhub-bus.js',
      dbPath: '/repo/devhub.db',
    };

    // Extract the body of a given helper function from the wrapper output.
    // The helpers are defined in the buildBusHelpersBlock. Bodies contain
    // bash `${var}` expansions (which include `}`), so we cannot use
    // a simple `[^}]+` quantifier. Instead, find the helper's opening
    // and take a fixed window of the next N chars (the longest helper
    // is _devhub_chat at ~700 chars; 2000 chars gives a safety margin).
    function extractHelperBody(result, helper) {
      const startMatch = result.match(new RegExp(`${helper}\\(\\)\\s*\\{`));
      if (!startMatch) return '';
      const startIdx = result.indexOf(startMatch[0]);
      // Take the next 2000 chars (long enough for the longest helper,
      // short enough to not overlap into the next helper).
      return result.slice(startIdx, startIdx + startMatch[0].length + 2000);
    }

    test('bus-debug log path is parameterized by DEVHUB_ROLE (canonical template)', () => {
      const result = buildAgentLaunchWrapper(debugParams);
      // The log path must follow the canonical template:
      // /tmp/devhub-swarm-${DEVHUB_ROLE:-<fallback>}.bus-debug
      // We accept either the explicit "coder" or the parameterized
      // "${DEVHUB_ROLE:-unknown}" form (the helper resolves the
      // variable at runtime).
      expect(result).toMatch(/\/tmp\/devhub-swarm-(coder|\\\$\{DEVHUB_ROLE)/);
      expect(result).toContain('.bus-debug');
    });

    test('_devhub_chat writes to the bus-debug log path', () => {
      const result = buildAgentLaunchWrapper(debugParams);
      const body = extractHelperBody(result, '_devhub_chat');
      expect(body).not.toBe('');
      // The helper must reference the debug log env var
      expect(body).toContain('_DEVHUB_BUS_DEBUG_LOG');
    });

    test('_devhub_event writes to the bus-debug log path', () => {
      const result = buildAgentLaunchWrapper(debugParams);
      const body = extractHelperBody(result, '_devhub_event');
      expect(body).not.toBe('');
      expect(body).toContain('_DEVHUB_BUS_DEBUG_LOG');
    });

    test('_devhub_presence writes to the bus-debug log path', () => {
      const result = buildAgentLaunchWrapper(debugParams);
      const body = extractHelperBody(result, '_devhub_presence');
      expect(body).not.toBe('');
      expect(body).toContain('_DEVHUB_BUS_DEBUG_LOG');
    });

    test('_devhub_inbox_check writes to the bus-debug log path', () => {
      const result = buildAgentLaunchWrapper(debugParams);
      const body = extractHelperBody(result, '_devhub_inbox_check');
      expect(body).not.toBe('');
      expect(body).toContain('_DEVHUB_BUS_DEBUG_LOG');
    });

    test('each helper writes timestamp + args + exit code to the debug log', () => {
      const result = buildAgentLaunchWrapper(debugParams);
      // All four helpers should write structured lines. We verify the
      // pattern: helper contains 'date' (for timestamp), writes
      // 'args' (for arg summary), and writes 'exit' (for exit code).
      // Using a single assertion for all four to keep the test focused
      // on the contract: every helper has all three log lines.
      const helpers = ['_devhub_chat', '_devhub_event', '_devhub_presence', '_devhub_inbox_check'];
      for (const helper of helpers) {
        const body = extractHelperBody(result, helper);
        expect(body).not.toBe('');
        // Timestamp: uses date command
        expect(body).toMatch(/date/);
        // Args: writes the args summary
        expect(body).toMatch(/args/);
        // Exit: writes the exit code
        expect(body).toMatch(/exit/);
      }
    });
  });

  // =========================================================================
  // T-021: Revert T-019 event-driven sentinel to a simple sleep.
  //
  // T-019.1's `tmux wait-for` mechanism typed the sentinel into the
  // agent's prompt buffer as user input (visible garbage in the TUI)
  // instead of just signaling readiness. This is a clean revert to a
  // configurable sleep until a working detection mechanism exists
  // (e.g., OpenCode hook writing a marker file).
  //
  // The function `buildTuiWaitForBlock` is kept (call sites unchanged)
  // but its body is now just `sleep ${graceSeconds}`.
  // =========================================================================
  describe('T-021: simple sleep TUI wait (T-019 revert)', () => {
    const tmuxParams = {
      ...baseParams,
      role: 'coder',
      tmuxSessionName: 'devhub-swarm-test-1-coder',
      bootstrapPrompt: 'Implement feature X with tests',
      busBinaryPath: '/repo/devhub-cli/bin/devhub-bus.js',
      dbPath: '/repo/devhub.db',
    };

    test('wrapper does NOT contain tmux wait-for or sentinel strings', () => {
      const result = buildAgentLaunchWrapper(tmuxParams);
      // T-019 sentinels and wait-for must be gone
      expect(result).not.toContain('tmux wait-for');
      expect(result).not.toContain('SENTINEL:DEVHUB_TUI_READY');
      // The send-keys for sentinel must be gone
      expect(result).not.toMatch(/tmux send-keys.*SENTINEL/);
    });

    test('wrapper emits a sleep N block (default 10s from tuiReadyGraceMs) before bootstrap', () => {
      const result = buildAgentLaunchWrapper(tmuxParams);
      // buildTuiWaitForBlock: default tuiReadyGraceMs=10000 → sleep 10
      expect(result).toMatch(/sleep 10/);
      // Inner bootstrap no longer adds a redundant fixed sleep.
      expect(result).not.toMatch(/sleep 2/);
    });

    test('wrapper uses chunked bootstrap emission (T2.2)', () => {
      const result = buildAgentLaunchWrapper(tmuxParams);
      expect(result).toContain('DEVHUB_BOOTSTRAP_CHUNK_0');
      expect(result).toMatch(/tmux paste-buffer -d -t "\$\{_tmux_session\}"/);
      expect(result).not.toContain("tmux load-buffer - <<'DEVHUB_BOOTSTRAP_PROMPT'");
    });

    test('wrapper with chunked bootstrap passes bash -n syntax check', () => {
      const { spawnSync } = require('child_process');
      const fs = require('fs');
      const os = require('os');
      const path = require('path');

      const result = buildAgentLaunchWrapper({
        ...tmuxParams,
        bootstrapPrompt:
          'Rol: Coder\nMisión: validar launch\n\n=== Worker: identidad y reporte ===\n- Reporta al Director.',
      });
      const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'devhub-wrapper-syntax-'));
      const tmp = path.join(tmpDir, 'wrapper.sh');
      fs.writeFileSync(tmp, result, { mode: 0o644 });
      const check = spawnSync('bash', ['-n', tmp], { encoding: 'utf-8' });
      expect(check.status).toBe(0);
      expect(check.stderr).toBe('');
    });

    test('tuiReadyGraceMs=5000 produces `sleep 5` in the emitted bash (configurable)', () => {
      const result = buildAgentLaunchWrapper({
        ...tmuxParams,
        tuiReadyGraceMs: 5000,
      });
      // 5000ms = 5s
      expect(result).toMatch(/sleep 5/);
    });

    test('tuiWaitTimeoutMs is ignored (param kept for backward compat, not emitted)', () => {
      const result = buildAgentLaunchWrapper({
        ...tmuxParams,
        tuiWaitTimeoutMs: 2000,
      });
      // 2000ms would have produced `timeout 2 tmux wait-for` in T-019.1.
      // T-021 ignores timeoutSeconds, so neither `timeout 2` nor
      // `tmux wait-for` should appear.
      expect(result).not.toMatch(/timeout 2[\s\n]+tmux\s+wait-for/);
      expect(result).not.toContain('tmux wait-for');
    });
  });

  // =========================================================================
  // T-020: Self-metrics in exit trap.
  //
  // Each agent's exit trap should sample its own process and its
  // children's CPU/RSS/etime and append the sample to
  // /tmp/devhub-swarm-<role>.metrics. This lets us understand the real
  // cost of each agent and figure out why CPU is high when idle.
  //
  // Requirements:
  //   (a) Exit trap contains `ps -p` self-metrics call.
  //   (b) Exit trap contains the children enumeration via `pgrep -P`.
  //   (c) The metrics log path is /tmp/devhub-swarm-${role}.metrics.
  //   (d) DEVHUB_AGENT_PID is in the env exports (so the trap knows
  //       which PID to sample).
  // =========================================================================
  describe('T-020: self-metrics in exit trap', () => {
    const metricsParams = {
      ...baseParams,
      role: 'coder',
      tmuxSessionName: 'devhub-swarm-test-1-coder',
      bootstrapPrompt: 'Implement feature X with tests',
      busBinaryPath: '/repo/devhub-cli/bin/devhub-bus.js',
      dbPath: '/repo/devhub.db',
    };

    test('exit trap contains a `ps -p` self-metrics call for the agent process', () => {
      const result = buildAgentLaunchWrapper(metricsParams);
      // The trap must sample the agent's own process via `ps -p`
      // (process status) for cpu/mem/etime.
      expect(result).toMatch(/ps -p "?\$\{?DEVHUB_AGENT_PID/);
    });

    test('exit trap enumerates child processes via `pgrep -P` for trans-cost analysis', () => {
      const result = buildAgentLaunchWrapper(metricsParams);
      // The trap must also walk the child tree to attribute the
      // total cost (opencode forks a child runtime, the child
      // spawns tool subprocesses, etc.).
      expect(result).toMatch(/pgrep -P "?\$\{?DEVHUB_AGENT_PID/);
    });

    test('metrics log path matches /tmp/devhub-swarm-${role}.metrics template', () => {
      const result = buildAgentLaunchWrapper(metricsParams);
      // The log path is parameterized by role at runtime
      // (${DEVHUB_ROLE:-unknown}). Accept either the explicit "coder"
      // or the parameterized form.
      expect(result).toMatch(/\/tmp\/devhub-swarm-(coder|\\\$\{DEVHUB_ROLE)/);
      expect(result).toContain('.metrics');
    });

    test('DEVHUB_AGENT_PID is in the env exports so the trap knows which PID to sample', () => {
      const result = buildAgentLaunchWrapper(metricsParams);
      // The env exports block must include DEVHUB_AGENT_PID
      // (already there for the agent's identity, but T-020 makes
      // it explicit that the trap USES it for ps sampling).
      expect(result).toContain('DEVHUB_AGENT_PID');
    });
  });
});
