const {
  AGENT_TUI_TYPES,
  detectAgentStateFromOutput,
  detectAgentTypeFromCommand,
  extractAgentSessionId,
  isAgentTuiCommand,
  resolveAgentTuiLabel,
  synthesizeAgentSessionId,
} = require('./agentTuiMetadata');

describe('agentTuiMetadata', () => {
  test('detectAgentTypeFromCommand recognizes all supported agents', () => {
    expect(detectAgentTypeFromCommand('opencode --session ses_1')).toBe('opencode');
    expect(detectAgentTypeFromCommand('kimi')).toBe('kimi');
    expect(detectAgentTypeFromCommand('claude')).toBe('claude');
    expect(detectAgentTypeFromCommand('codex')).toBe('codex');
    expect(detectAgentTypeFromCommand('grok')).toBe('grok');
    expect(detectAgentTypeFromCommand('groc')).toBe('grok');
    expect(detectAgentTypeFromCommand('hermes')).toBe('hermes');
    expect(detectAgentTypeFromCommand('bash')).toBeNull();
    expect(detectAgentTypeFromCommand('')).toBeNull();
  });

  test('extractAgentSessionId pulls explicit session ids', () => {
    expect(extractAgentSessionId('opencode', 'opencode --session ses_1')).toBe('ses_1');
    expect(extractAgentSessionId('kimi', 'kimi --session km-123')).toBe('km-123');
    expect(extractAgentSessionId('claude', 'claude resume cl-456')).toBe('cl-456');
    expect(extractAgentSessionId('codex', 'codex --session cd-789')).toBe('cd-789');
    expect(extractAgentSessionId('hermes', 'hermes')).toBeNull();
    expect(extractAgentSessionId('grok', 'grok')).toBeNull();
  });

  test('extractAgentSessionId pulls grok resume and pre-assigned ids', () => {
    expect(extractAgentSessionId('grok', 'grok --resume gk-1')).toBe('gk-1');
    expect(extractAgentSessionId('grok', 'grok -r gk-2')).toBe('gk-2');
    expect(extractAgentSessionId('grok', 'grok --session-id gk-3')).toBe('gk-3');
    expect(
      extractAgentSessionId('grok', 'grok --session-id 123e4567-e89b-42d3-a456-426614174000')
    ).toBe('123e4567-e89b-42d3-a456-426614174000');
    expect(extractAgentSessionId('grok', 'grok')).toBeNull();
  });

  test('extractAgentSessionId pulls qodercli resume and pre-assigned ids', () => {
    expect(extractAgentSessionId('qodercli', 'qodercli --resume qd-1')).toBe('qd-1');
    expect(extractAgentSessionId('qodercli', 'qodercli -r qd-2')).toBe('qd-2');
    expect(extractAgentSessionId('qodercli', 'qodercli resume qd-3')).toBe('qd-3');
    expect(extractAgentSessionId('qodercli', 'qodercli --session-id qd-4')).toBe('qd-4');
    expect(extractAgentSessionId('qodercli', 'qodercli')).toBeNull();
  });

  test('isAgentTuiCommand matches commands anywhere in string', () => {
    expect(isAgentTuiCommand("bash -lc 'opencode --session ses_1'")).toBe(true);
    expect(isAgentTuiCommand('claude --session x')).toBe(true);
    expect(isAgentTuiCommand('zsh')).toBe(false);
  });

  test('resolveAgentTuiLabel returns readable names', () => {
    expect(resolveAgentTuiLabel('opencode')).toBe('OpenCode');
    expect(resolveAgentTuiLabel('kimi')).toBe('Kimi Code');
    expect(resolveAgentTuiLabel('claude')).toBe('Claude');
    expect(resolveAgentTuiLabel('codex')).toBe('Codex');
    expect(resolveAgentTuiLabel('grok')).toBe('Grok');
    expect(resolveAgentTuiLabel('hermes')).toBe('Hermes');
    expect(resolveAgentTuiLabel(null)).toBe('Agente TUI');
  });

  test('synthesizeAgentSessionId builds deterministic ids', () => {
    expect(synthesizeAgentSessionId('kimi', 'term-1')).toBe('kimi-term-1');
    expect(synthesizeAgentSessionId('claude', 'term-2')).toBe('claude-term-2');
  });

  test('detectAgentStateFromOutput infers running from thinking/working markers', () => {
    expect(detectAgentStateFromOutput('K2.7 Code thinking', 'kimi')).toBe('running');
    expect(detectAgentStateFromOutput('model: working...', 'codex')).toBe('running');
    expect(detectAgentStateFromOutput('agent is busy now', 'claude')).toBe('running');
    expect(detectAgentStateFromOutput('ready', 'kimi')).toBe('idle');
    expect(detectAgentStateFromOutput('plain output', 'kimi')).toBeNull();
    expect(detectAgentStateFromOutput('thinking', null)).toBeNull();
  });

  test('AGENT_TUI_TYPES includes claude and codex', () => {
    expect(AGENT_TUI_TYPES).toContain('claude');
    expect(AGENT_TUI_TYPES).toContain('codex');
    expect(AGENT_TUI_TYPES).toContain('kimi');
  });
});
