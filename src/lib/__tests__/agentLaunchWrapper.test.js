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

    test('returns comment when no supervisor URL', () => {
      const result = buildExitTrapCommand({ ...baseParams, supervisorUrl: undefined });
      expect(result).toContain('# Exit trap skipped');
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
});
