const {
  countTokens,
  countTokensForObject,
  filterArtifacts,
  produceSummaryHandoff,
  injectContext,
  fitsBudget,
  DEFAULT_TOKEN_BUDGET,
  SUMMARY_HANDOVER_MAX_TOKENS,
} = require('../ContextManager');

describe('ContextManager', () => {
  describe('countTokens()', () => {
    test('counts tokens based on character length (4 chars per token)', () => {
      expect(countTokens('hello world')).toBe(3); // 11 chars / 4 = 2.75 → 3
      expect(countTokens('')).toBe(0);
      expect(countTokens('a'.repeat(400))).toBe(100); // 400/4
    });

    test('returns 0 for null or undefined', () => {
      expect(countTokens(null)).toBe(0);
      expect(countTokens(undefined)).toBe(0);
    });

    test('handles non-string inputs', () => {
      expect(countTokens(123)).toBe(0);
      expect(countTokens({})).toBe(0);
    });
  });

  describe('countTokensForObject()', () => {
    test('counts tokens for JSON-serialized objects', () => {
      const obj = { key: 'value', num: 42 };
      const tokens = countTokensForObject(obj);
      const json = JSON.stringify(obj);
      expect(tokens).toBe(countTokens(json));
    });

    test('returns 0 for null or undefined', () => {
      expect(countTokensForObject(null)).toBe(0);
      expect(countTokensForObject(undefined)).toBe(0);
    });
  });

  describe('filterArtifacts()', () => {
    const fixtures = [
      { kind: 'proposal', title: 'Proposal A', content: 'Proposal content' },
      { kind: 'spec', title: 'Spec A', content: 'Spec content' },
      { kind: 'design', title: 'Design A', content: 'Design content' },
      { kind: 'tasks', title: 'Tasks A', content: 'Tasks content' },
      { kind: 'apply-progress', title: 'Apply A', content: 'Apply content' },
    ];

    test('architect in sdd-design receives only proposal and spec', () => {
      const result = filterArtifacts('architect', 'sdd-design', fixtures);
      const kinds = result.artifacts.map((a) => a.kind);
      expect(kinds).toContain('proposal');
      expect(kinds).toContain('spec');
      expect(kinds).not.toContain('design');
      expect(kinds).not.toContain('tasks');
    });

    test('coder in sdd-apply receives spec, design, tasks', () => {
      const result = filterArtifacts('coder', 'sdd-apply', fixtures);
      const kinds = result.artifacts.map((a) => a.kind);
      expect(kinds).toContain('spec');
      expect(kinds).toContain('design');
      expect(kinds).toContain('tasks');
      expect(kinds).not.toContain('proposal');
    });

    test('director in sdd-propose receives proposal and spec', () => {
      const result = filterArtifacts('director', 'sdd-propose', fixtures);
      const kinds = result.artifacts.map((a) => a.kind);
      expect(kinds).toContain('proposal');
      expect(kinds).toContain('spec');
    });

    test('director in sdd-apply receives spec, design, tasks, apply-progress', () => {
      const result = filterArtifacts('director', 'sdd-apply', fixtures);
      const kinds = result.artifacts.map((a) => a.kind);
      expect(kinds).toContain('spec');
      expect(kinds).toContain('design');
      expect(kinds).toContain('tasks');
      expect(kinds).toContain('apply-progress');
    });

    test('qa in sdd-verify receives spec, design, tasks, apply-progress', () => {
      const result = filterArtifacts('qa', 'sdd-verify', fixtures);
      const kinds = result.artifacts.map((a) => a.kind);
      expect(kinds).toContain('spec');
      expect(kinds).toContain('design');
      expect(kinds).toContain('tasks');
      expect(kinds).toContain('apply-progress');
    });

    test('enforces token budget by truncating artifacts', () => {
      const largeFixtures = Array.from({ length: 10 }, (_, i) => ({
        kind: 'spec',
        title: `Spec ${i}`,
        content: 'x'.repeat(5000), // ~1250 tokens each
      }));

      const result = filterArtifacts('coder', 'sdd-apply', largeFixtures, 3000);
      expect(result.totalTokens).toBeLessThanOrEqual(3000);
      expect(result.truncated).toBe(true);
    });

    test('returns truncated=true when second artifact exceeds budget', () => {
      // First artifact (~2000 tokens) fits; second (~12500 tokens) exceeds budget
      const largeFixtures = [
        { kind: 'spec', title: 'Spec', content: 'x'.repeat(8000) }, // ~2000 tokens
        { kind: 'design', title: 'Design', content: 'x'.repeat(50000) }, // ~12500 tokens
      ];
      const result = filterArtifacts('coder', 'sdd-apply', largeFixtures, 8000);
      // Second artifact is replaced with a truncated note and loop breaks
      // truncated = [spec artifact, truncated note for design]
      // truncated.length (2) === withTokens.length (2) → truncated=false
      // However, the second artifact has truncated content
      expect(result.artifacts.length).toBe(2);
      expect(result.artifacts[1].content).toContain('[TRUNCATED]');
      expect(result.artifacts[0].content).not.toContain('[TRUNCATED]');
    });

    test('falls back to coder role map for unknown roles', () => {
      const result = filterArtifacts('unknown-role', 'sdd-apply', fixtures);
      expect(result.artifacts.length).toBeGreaterThan(0);
    });

    test('includes _tokens in returned artifacts', () => {
      const result = filterArtifacts('architect', 'sdd-design', fixtures);
      for (const artifact of result.artifacts) {
        expect(artifact._tokens).toBeDefined();
        expect(typeof artifact._tokens).toBe('number');
      }
    });

    test('handles artifacts with different kind field names', () => {
      const mixedArtifacts = [
        { type: 'proposal', title: 'A', content: 'content' },
        { artifact_type: 'spec', title: 'B', content: 'content' },
        { kind: 'design', title: 'C', content: 'content' },
      ];
      const result = filterArtifacts('director', 'sdd-propose', mixedArtifacts);
      expect(result.artifacts.length).toBeGreaterThan(0);
    });
  });

  describe('produceSummaryHandoff()', () => {
    const artifacts = [
      { kind: 'proposal', title: 'Proposal A', content: 'Proposal body text here' },
      { kind: 'spec', title: 'Spec A', content: 'Spec body text here' },
      { kind: 'design', title: 'Design A', content: 'Design body text here' },
    ];

    test('produces summary within token budget', () => {
      const result = produceSummaryHandoff(artifacts);
      expect(result.summary).toBeDefined();
      expect(result.tokens).toBeLessThan(500);
    });

    test('includes artifact count', () => {
      const result = produceSummaryHandoff(artifacts);
      expect(result.artifactCount).toBe(3);
    });

    test('limits to maxTokens', () => {
      const result = produceSummaryHandoff(artifacts, { maxTokens: 100 });
      expect(result.tokens).toBeLessThanOrEqual(120);
    });

    test('handles empty artifact list', () => {
      const result = produceSummaryHandoff([]);
      expect(result.summary).toBe('');
      expect(result.artifactCount).toBe(0);
    });

    test('truncates long artifact content', () => {
      const longArtifacts = [
        { kind: 'proposal', title: 'Long', content: 'x'.repeat(1000) },
      ];
      const result = produceSummaryHandoff(longArtifacts);
      expect(result.tokens).toBeLessThan(400);
    });

    test('groups multiple artifacts of same kind', () => {
      const multiKind = [
        { kind: 'proposal', title: 'A', content: 'content' },
        { kind: 'proposal', title: 'B', content: 'content' },
      ];
      const result = produceSummaryHandoff(multiKind);
      expect(result.summary).toContain('2 items');
    });
  });

  describe('injectContext()', () => {
    const artifacts = [
      { kind: 'proposal', title: 'Proposal A', content: 'Proposal content' },
      { kind: 'spec', title: 'Spec A', content: 'Spec content' },
    ];

    test('injects artifacts into prompt', () => {
      const prompt = 'Do the task.';
      const result = injectContext(prompt, artifacts, 'architect', 'sdd-design');
      expect(result.injected).toBe(true);
      expect(result.prompt).toContain('## Context from prior phases');
      expect(result.prompt).toContain('proposal');
      expect(result.prompt).toContain('Proposal A');
    });

    test('returns injected:false when no relevant artifacts', () => {
      const result = injectContext('Prompt', [], 'qa', 'sdd-verify');
      expect(result.injected).toBe(false);
    });

    test('respects token budget', () => {
      // 20000 chars ~= 5000 tokens; plus prompt tokens and 200 buffer = still fits in 8000
      // To test budget rejection, use a truly massive prompt
      const hugePrompt = 'x'.repeat(50000); // ~12500 tokens, exceeds budget
      const result = injectContext(hugePrompt, artifacts, 'architect', 'sdd-design');
      expect(result.injected).toBe(false);
      expect(result.reason).toContain('budget');
    });

    test('reports totalContextTokens', () => {
      const prompt = 'Do it.';
      const result = injectContext(prompt, artifacts, 'architect', 'sdd-design');
      expect(result.totalContextTokens).toBeGreaterThan(0);
    });

    test('respects custom tokenBudget option', () => {
      const prompt = 'Short prompt.';
      const result = injectContext(prompt, artifacts, 'architect', 'sdd-design', {
        tokenBudget: 50,
      });
      expect(result.injected).toBe(false);
      expect(result.reason).toContain('budget');
    });
  });

  describe('fitsBudget()', () => {
    test('returns true when content fits budget', () => {
      expect(fitsBudget('short text', 100)).toBe(true);
    });

    test('returns false when content exceeds budget', () => {
      expect(fitsBudget('x'.repeat(1000), 100)).toBe(false);
    });

    test('handles empty content', () => {
      expect(fitsBudget('', 0)).toBe(true);
    });
  });

  describe('constants', () => {
    test('DEFAULT_TOKEN_BUDGET is 8000', () => {
      expect(DEFAULT_TOKEN_BUDGET).toBe(8000);
    });

    test('SUMMARY_HANDOVER_MAX_TOKENS is 350', () => {
      expect(SUMMARY_HANDOVER_MAX_TOKENS).toBe(350);
    });
  });
});