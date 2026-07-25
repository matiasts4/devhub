/**
 * Tests for semanticMetadata utility functions.
 * TDD: Written BEFORE production code exists.
 */

const {
  getSessionRenderKey,
  getAgentFromCommand,
  normalizeAgentLabel,
  shortenSemanticLabel,
  shortPath,
  shortenCommandSummary,
  buildUniqueRenderKey,
  readAgentRunsByPanel,
  derivePanelCommandMetadata,
  derivePanelSemanticMetadata,
} = require('../terminal/utils/semanticMetadata');

describe('getSessionRenderKey', () => {
  test('builds key from session id', () => {
    expect(getSessionRenderKey({ id: 'abc' }, 'prefix', 0)).toBe('prefix-abc-0');
  });

  test('falls back to sessionId or terminalId', () => {
    expect(getSessionRenderKey({ sessionId: 'xyz' }, 'prefix', 1)).toBe('prefix-xyz-1');
    expect(getSessionRenderKey({ terminalId: 't1' }, 'prefix', 2)).toBe('prefix-t1-2');
  });

  test('uses fallback prefix when no session identifiers', () => {
    expect(getSessionRenderKey({}, 'fallback', 3)).toBe('fallback-session-3');
  });
});

describe('getAgentFromCommand', () => {
  test('extracts agent from --agent flag', () => {
    expect(getAgentFromCommand('opencode --agent coder')).toBe('coder');
  });

  test('detects gentleman and gemini keywords', () => {
    expect(getAgentFromCommand('gentleman run')).toBe('gentleman');
    expect(getAgentFromCommand('gemini chat')).toBe('gemini');
  });

  test('detects opencode session pattern', () => {
    const result = getAgentFromCommand('opencode --session abc123def');
    expect(result).toContain('OpenCode');
    expect(result).toContain('abc123');
  });

  test('returns null for unknown commands', () => {
    expect(getAgentFromCommand('npm test')).toBeNull();
    expect(getAgentFromCommand('')).toBeNull();
    expect(getAgentFromCommand(null)).toBeNull();
  });
});

describe('normalizeAgentLabel', () => {
  test('normalizes opencode to OpenCode', () => {
    expect(normalizeAgentLabel('opencode')).toBe('OpenCode');
    expect(normalizeAgentLabel('OpenCode')).toBe('OpenCode');
  });

  test('returns trimmed string for other agents', () => {
    expect(normalizeAgentLabel('  coder  ')).toBe('coder');
  });

  test('returns null for empty/falsy input', () => {
    expect(normalizeAgentLabel('')).toBeNull();
    expect(normalizeAgentLabel(null)).toBeNull();
  });
});

describe('shortenSemanticLabel', () => {
  test('returns null for empty input', () => {
    expect(shortenSemanticLabel('')).toBeNull();
    expect(shortenSemanticLabel(null)).toBeNull();
  });

  test('returns short strings unchanged', () => {
    expect(shortenSemanticLabel('hello', 40)).toBe('hello');
  });

  test('truncates long strings with ellipsis', () => {
    const long = 'a'.repeat(50);
    const result = shortenSemanticLabel(long, 10);
    expect(result.length).toBe(10);
    expect(result.endsWith('…')).toBe(true);
  });
});

describe('shortPath', () => {
  test('returns ~ for empty path', () => {
    expect(shortPath('')).toBe('~');
    expect(shortPath(null)).toBe('~');
  });

  test('returns full path for short paths', () => {
    expect(shortPath('/foo')).toBe('/foo');
    expect(shortPath('/foo/bar')).toBe('/foo/bar');
  });

  test('truncates long paths to last 2 segments', () => {
    expect(shortPath('/a/b/c/d')).toBe('.../c/d');
  });
});

describe('shortenCommandSummary', () => {
  test('returns default for empty command', () => {
    expect(shortenCommandSummary('')).toBe('Ejecucion iniciada desde terminal');
  });

  test('returns short commands unchanged', () => {
    expect(shortenCommandSummary('npm test')).toBe('npm test');
  });

  test('truncates long commands', () => {
    const long = 'a'.repeat(200);
    const result = shortenCommandSummary(long);
    expect(result.length).toBe(140);
    expect(result.endsWith('...')).toBe(true);
  });
});

describe('buildUniqueRenderKey', () => {
  test('returns base key on first use', () => {
    const counts = new Map();
    expect(buildUniqueRenderKey('tab', 'ws1', 0, counts)).toBe('tab-ws1-0');
  });

  test('appends counter on duplicate base', () => {
    const counts = new Map();
    expect(buildUniqueRenderKey('tab', 'ws1', 0, counts)).toBe('tab-ws1-0');
    expect(buildUniqueRenderKey('tab', 'ws1', 1, counts)).toBe('tab-ws1-1-1');
  });
});

describe('readAgentRunsByPanel', () => {
  test('returns empty object for null storage', () => {
    expect(readAgentRunsByPanel(null)).toEqual({});
  });

  test('returns empty object for invalid JSON', () => {
    const storage = { getItem: () => 'not-json' };
    expect(readAgentRunsByPanel(storage)).toEqual({});
  });

  test('indexes runs by panelId keeping latest', () => {
    const storage = {
      getItem: (key) =>
        key === 'devhub_agent_runs'
          ? JSON.stringify({
              run1: { panelId: 'p1', launchedAt: 100 },
              run2: { panelId: 'p1', launchedAt: 200 },
              run3: { panelId: 'p2', launchedAt: 150 },
            })
          : null,
    };
    const result = readAgentRunsByPanel(storage);
    expect(result.p1.launchedAt).toBe(200);
    expect(result.p2.launchedAt).toBe(150);
  });
});

describe('derivePanelCommandMetadata', () => {
  test('detects OpenCode session pattern', () => {
    const meta = derivePanelCommandMetadata('opencode --session abc123');
    expect(meta.source).toBe('command');
    expect(meta.primary).toContain('OpenCode');
  });

  test('detects opencode keyword', () => {
    const meta = derivePanelCommandMetadata('opencode');
    expect(meta.primary).toBe('OpenCode');
  });

  test('detects opencode keyword with agent', () => {
    const meta = derivePanelCommandMetadata('opencode --agent coder');
    // 'opencode' keyword triggers opencode branch, agent becomes secondary
    expect(meta.primary).toBe('OpenCode');
    expect(meta.secondary).toBe('coder');
  });

  test('falls back to Terminal for unknown commands', () => {
    const meta = derivePanelCommandMetadata('npm test');
    expect(meta.source).toBe('fallback');
    expect(meta.primary).toBe('Terminal');
  });
});

describe('derivePanelSemanticMetadata', () => {
  test('returns fallback metadata when no agent run and no swarm role', () => {
    const panel = { initialCommand: 'npm test' };
    const meta = derivePanelSemanticMetadata(panel, null);
    expect(meta.source).toBe('fallback');
    expect(meta.primary).toBe('Terminal');
  });

  test('includes swarm role when panel has swarmRole', () => {
    const panel = { initialCommand: 'opencode', swarmRole: { roleKey: 'coder' } };
    const meta = derivePanelSemanticMetadata(panel, null);
    expect(meta.swarmRole).toBeDefined();
    expect(meta.swarmRole.roleKey).toBe('coder');
  });

  test('uses agent run data when available', () => {
    const panel = { initialCommand: 'npm test' };
    const agentRun = { selectedAgent: 'coder', taskTitle: 'Fix bug' };
    const meta = derivePanelSemanticMetadata(panel, agentRun);
    expect(meta.source).toBe('agent-run');
    expect(meta.primary).toBe('coder');
  });
});
