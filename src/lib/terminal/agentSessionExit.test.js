import {
  buildTerminalExitOverlayCopy,
  isAgentTuiCommand,
  parseTerminalExitReason,
  resolveAgentTuiLabel,
} from './agentSessionExit';

describe('agentSessionExit', () => {
  test('isAgentTuiCommand recognizes kimi and opencode', () => {
    expect(isAgentTuiCommand('kimi')).toBe(true);
    expect(isAgentTuiCommand('opencode --session ses_1')).toBe(true);
    expect(isAgentTuiCommand('bash')).toBe(false);
  });

  test('parseTerminalExitReason distinguishes child vs agent exits', () => {
    expect(parseTerminalExitReason('child-exited:0')).toEqual({
      kind: 'shell',
      exitCode: 0,
      agentCause: null,
      abnormal: false,
    });
    expect(parseTerminalExitReason('agent-exited:fetch-failed')).toEqual({
      kind: 'agent',
      exitCode: null,
      agentCause: 'fetch-failed',
      abnormal: true,
    });
  });

  test('buildTerminalExitOverlayCopy surfaces agent crash context', () => {
    const copy = buildTerminalExitOverlayCopy({
      initialCommand: 'kimi',
      reason: 'agent-exited:fetch-failed',
      connectionState: 'agent-exited',
    });
    expect(copy.title).toBe('Kimi Code finalizó');
    expect(copy.body).toContain('fetch failed');
    expect(copy.actionLabel).toBe('Relanzar Kimi Code');
  });

  test('resolveAgentTuiLabel maps commands', () => {
    expect(resolveAgentTuiLabel('opencode --session x')).toBe('OpenCode');
    expect(resolveAgentTuiLabel('kimi')).toBe('Kimi Code');
  });
});
