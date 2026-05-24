// Tests for semanticMetadata.js — pure utility functions for panel labels, agent detection, render keys.
// Strict TDD: RED → GREEN → TRIANGULATE

import {
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
} from '../../src/components/terminal/utils/semanticMetadata';

describe('semanticMetadata', () => {
  describe('getSessionRenderKey', () => {
    it('builds key from session id', () => {
      expect(getSessionRenderKey({ id: 'abc' }, 'ws', 0)).toBe('ws-abc-0');
    });

    it('falls back to sessionId when id missing', () => {
      expect(getSessionRenderKey({ sessionId: 'xyz' }, 'ws', 1)).toBe('ws-xyz-1');
    });

    it('uses fallback prefix', () => {
      expect(getSessionRenderKey({}, 'panel', 2)).toBe('panel-session-2');
    });
  });

  describe('getAgentFromCommand', () => {
    it('detects agent from --agent flag', () => {
      expect(getAgentFromCommand('opencode --agent claude-sonnet')).toBe('claude-sonnet');
    });

    it('detects gentleman agent', () => {
      expect(getAgentFromCommand('gentleman --session abc')).toBe('gentleman');
    });

    it('detects gemini agent', () => {
      expect(getAgentFromCommand('gemini run')).toBe('gemini');
    });

    it('detects plain opencode', () => {
      expect(getAgentFromCommand('opencode')).toBe('OpenCode');
    });

    it('detects opencode with session', () => {
      const result = getAgentFromCommand('opencode --session abc123def');
      expect(result).toContain('OpenCode');
      expect(result).toContain('abc123');
    });

    it('returns null for non-agent commands', () => {
      expect(getAgentFromCommand('npm test')).toBeNull();
      expect(getAgentFromCommand('')).toBeNull();
      expect(getAgentFromCommand(null)).toBeNull();
    });
  });

  describe('normalizeAgentLabel', () => {
    it('normalizes opencode to OpenCode', () => {
      expect(normalizeAgentLabel('opencode')).toBe('OpenCode');
      expect(normalizeAgentLabel('  OpenCode  ')).toBe('OpenCode');
    });

    it('returns null for empty input', () => {
      expect(normalizeAgentLabel('')).toBeNull();
      expect(normalizeAgentLabel(null)).toBeNull();
    });

    it('passes through other labels', () => {
      expect(normalizeAgentLabel('claude')).toBe('claude');
    });
  });

  describe('shortenSemanticLabel', () => {
    it('returns full string when under max length', () => {
      expect(shortenSemanticLabel('short text', 40)).toBe('short text');
    });

    it('truncates with ellipsis when over max length', () => {
      const long = 'a'.repeat(50);
      const result = shortenSemanticLabel(long, 20);
      expect(result.length).toBe(20);
      expect(result.endsWith('…')).toBe(true);
    });

    it('returns null for empty input', () => {
      expect(shortenSemanticLabel('')).toBeNull();
      expect(shortenSemanticLabel(null)).toBeNull();
    });
  });

  describe('shortPath', () => {
    it('returns ~ for empty path', () => {
      expect(shortPath(null)).toBe('~');
      expect(shortPath('')).toBe('~');
    });

    it('returns full path for short paths', () => {
      expect(shortPath('/foo/bar')).toBe('/foo/bar');
    });

    it('truncates long paths to last 2 segments', () => {
      expect(shortPath('/a/b/c/d')).toBe('.../c/d');
    });
  });

  describe('shortenCommandSummary', () => {
    it('returns default for empty command', () => {
      expect(shortenCommandSummary('')).toBe('Ejecucion iniciada desde terminal');
      expect(shortenCommandSummary(null)).toBe('Ejecucion iniciada desde terminal');
    });

    it('returns full command when under 140 chars', () => {
      expect(shortenCommandSummary('npm test -- --coverage')).toBe('npm test -- --coverage');
    });

    it('truncates long commands', () => {
      const long = 'a'.repeat(200);
      const result = shortenCommandSummary(long);
      expect(result.length).toBe(140);
      expect(result.endsWith('...')).toBe(true);
    });
  });

  describe('buildUniqueRenderKey', () => {
    it('returns base key on first use', () => {
      const counts = new Map();
      expect(buildUniqueRenderKey('panel', 'p1', 0, counts)).toBe('panel-p1-0');
    });

    it('adds suffix on duplicate', () => {
      const counts = new Map();
      expect(buildUniqueRenderKey('panel', 'p1', 0, counts)).toBe('panel-p1-0');
      expect(buildUniqueRenderKey('panel', 'p1', 1, counts)).toBe('panel-p1-1-1');
    });
  });

  describe('readAgentRunsByPanel', () => {
    it('returns empty object for null storage', () => {
      expect(readAgentRunsByPanel(null)).toEqual({});
    });

    it('returns empty object for empty storage', () => {
      const mockStorage = { getItem: () => '{}' };
      expect(readAgentRunsByPanel(mockStorage)).toEqual({});
    });

    it('indexes runs by panelId, keeping latest', () => {
      const mockStorage = {
        getItem: (key) => {
          if (key === 'devhub_agent_runs') {
            return JSON.stringify({
              run1: { panelId: 'p1', launchedAt: 100 },
              run2: { panelId: 'p1', launchedAt: 200 },
              run3: { panelId: 'p2', launchedAt: 150 },
            });
          }
          return null;
        },
      };
      const result = readAgentRunsByPanel(mockStorage);
      expect(result.p1.launchedAt).toBe(200);
      expect(result.p2.launchedAt).toBe(150);
      expect(Object.keys(result)).toHaveLength(2);
    });
  });

  describe('derivePanelCommandMetadata', () => {
    it('detects OpenCode from command', () => {
      const result = derivePanelCommandMetadata('opencode --agent claude');
      expect(result.source).toBe('command');
      expect(result.primary).toBe('OpenCode');
    });

    it('detects specific agent', () => {
      const result = derivePanelCommandMetadata('opencode --agent gemini');
      expect(result.primary).toBe('OpenCode');
      expect(result.secondary).toBe('gemini');
    });

    it('falls back to Terminal for plain commands', () => {
      const result = derivePanelCommandMetadata('npm test');
      expect(result.primary).toBe('Terminal');
      expect(result.source).toBe('fallback');
    });

    it('handles empty command', () => {
      const result = derivePanelCommandMetadata('');
      expect(result.primary).toBe('Terminal');
      expect(result.fullText).toBe('Terminal');
    });
  });

  describe('derivePanelSemanticMetadata', () => {
    it('returns command metadata when no agent run', () => {
      const panel = { initialCommand: 'npm test' };
      const result = derivePanelSemanticMetadata(panel, null);
      expect(result.source).toBe('fallback');
      expect(result.primary).toBe('Terminal');
    });

    it('includes swarm role when panel has one', () => {
      const panel = { initialCommand: '', swarmRole: { roleKey: 'coder' } };
      const result = derivePanelSemanticMetadata(panel, null);
      expect(result.swarmRole).toBeDefined();
      expect(result.swarmRole.roleKey).toBe('coder');
    });

    it('uses agent run data when available', () => {
      const panel = { initialCommand: '' };
      const agentRun = {
        selectedAgent: 'claude',
        taskTitle: 'Fix auth bug',
        opencodeSessionId: 'abc123',
      };
      const result = derivePanelSemanticMetadata(panel, agentRun);
      expect(result.source).toBe('agent-run');
      expect(result.primary).toBe('claude');
    });
  });
});
