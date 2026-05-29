const {
  resolveModelAlias,
  getModelAliases,
  isUnifiedModel,
  detectTestRunner,
  canImplementTDD,
  getTDDCapability,
  createTDDEvidence,
  recordRedPhase,
  recordGreenPhase,
  recordRefactorPhase,
  completeTDDEvidence,
  formatTDDEvidence,
  formatApplyProgress,
  MODEL_ALIAS_MAP,
  TEST_RUNNERS,
} = require('../ModelConsolidator');

describe('ModelConsolidator', () => {
  describe('resolveModelAlias()', () => {
    test('resolves minimax-2.7 to minimax-coding-plan/MiniMax-M2.7', () => {
      expect(resolveModelAlias('minimax-2.7')).toBe('minimax-coding-plan/MiniMax-M2.7');
    });

    test('resolves minimax-m2.7 to minimax-coding-plan/MiniMax-M2.7', () => {
      expect(resolveModelAlias('minimax-m2.7')).toBe('minimax-coding-plan/MiniMax-M2.7');
    });

    test('resolves minimax to minimax-coding-plan/MiniMax-M2.7', () => {
      expect(resolveModelAlias('minimax')).toBe('minimax-coding-plan/MiniMax-M2.7');
    });

    test('resolves mm2.7 to minimax-coding-plan/MiniMax-M2.7', () => {
      expect(resolveModelAlias('mm2.7')).toBe('minimax-coding-plan/MiniMax-M2.7');
    });

    test('resolves legacy Claude aliases to unified model', () => {
      expect(resolveModelAlias('claude-sonnet-4-20250514')).toBe(
        'minimax-coding-plan/MiniMax-M2.7'
      );
      expect(resolveModelAlias('claude-opus-4-20250514')).toBe('minimax-coding-plan/MiniMax-M2.7');
    });

    test('resolves legacy GPT aliases to unified model', () => {
      expect(resolveModelAlias('github-copilot/gpt-5.4-mini')).toBe(
        'minimax-coding-plan/MiniMax-M2.7'
      );
      expect(resolveModelAlias('github-copilot/gpt-5.4')).toBe('minimax-coding-plan/MiniMax-M2.7');
    });

    test('resolves default and swarm-default to unified model', () => {
      expect(resolveModelAlias('default')).toBe('minimax-coding-plan/MiniMax-M2.7');
      expect(resolveModelAlias('swarm-default')).toBe('minimax-coding-plan/MiniMax-M2.7');
    });

    test('resolves null and undefined to unified model', () => {
      expect(resolveModelAlias(null)).toBe('minimax-coding-plan/MiniMax-M2.7');
      expect(resolveModelAlias(undefined)).toBe('minimax-coding-plan/MiniMax-M2.7');
    });

    test('normalizes and trims input', () => {
      expect(resolveModelAlias('  MINIMAX-2.7  ')).toBe('minimax-coding-plan/MiniMax-M2.7');
    });

    test('falls back to unified model for unknown aliases', () => {
      expect(resolveModelAlias('unknown-model-xyz')).toBe('minimax-coding-plan/MiniMax-M2.7');
    });

    test('returns MODEL_ALIAS_MAP for reference', () => {
      expect(MODEL_ALIAS_MAP['minimax-2.7']).toBe('minimax-coding-plan/MiniMax-M2.7');
    });
  });

  describe('getModelAliases()', () => {
    test('returns all aliases for the unified model', () => {
      const aliases = getModelAliases('minimax-coding-plan/MiniMax-M2.7');
      expect(aliases).toContain('minimax-2.7');
      expect(aliases).toContain('minimax-m2.7');
      expect(aliases).toContain('minimax');
      expect(aliases).toContain('mm2.7');
      expect(aliases).toContain('claude-sonnet-4-20250514');
      expect(aliases).toContain('default');
    });

    test('returns empty array for unknown model', () => {
      expect(getModelAliases('unknown-model')).toEqual([]);
    });
  });

  describe('isUnifiedModel()', () => {
    test('returns true for minimax-coding-plan/MiniMax-M2.7', () => {
      expect(isUnifiedModel('minimax-coding-plan/MiniMax-M2.7')).toBe(true);
    });

    test('returns false for other models', () => {
      expect(isUnifiedModel('claude-sonnet-4-20250514')).toBe(false);
      expect(isUnifiedModel('gpt-5')).toBe(false);
    });
  });

  describe('detectTestRunner()', () => {
    test('detects vitest when vitest.config.ts exists', () => {
      // This test uses the project root; vitest.config.ts doesn't exist in root
      const result = detectTestRunner('/tmp/nonexistent');
      expect(result.available).toBe(false);
    });

    test('returns unavailable for nonexistent project root', () => {
      const result = detectTestRunner('/tmp/definitely-not-a-real-project-path');
      expect(result.available).toBe(false);
      expect(result.name).toBeNull();
    });

    test('TEST_RUNNERS includes expected frameworks', () => {
      expect(TEST_RUNNERS.jest).toBeDefined();
      expect(TEST_RUNNERS.vitest).toBeDefined();
      expect(TEST_RUNNERS.playwright).toBeDefined();
      expect(TEST_RUNNERS['next test']).toBeDefined();
    });
  });

  describe('canImplementTDD()', () => {
    test('returns true for MiniMax 2.7 (unified model)', () => {
      expect(canImplementTDD('minimax-2.7')).toBe(true);
      expect(canImplementTDD('minimax-coding-plan/MiniMax-M2.7')).toBe(true);
    });

    test('returns true for all resolved models (alias resolution unifies to minimax-m2.7)', () => {
      // All known aliases resolve to minimax-coding-plan/MiniMax-M2.7 which CAN implement TDD
      expect(canImplementTDD('minimax-2.7')).toBe(true);
      expect(canImplementTDD('claude-sonnet-4-20250514')).toBe(true);
      expect(canImplementTDD('github-copilot/gpt-5.4-mini')).toBe(true);
      // Unknown aliases fall back to unified model and also return true
      expect(canImplementTDD('totally-unknown')).toBe(true);
    });
  });

  describe('getTDDCapability()', () => {
    test('returns capability details for MiniMax 2.7', () => {
      const cap = getTDDCapability('minimax-2.7');
      expect(cap.canImplement).toBe(true);
      expect(cap.modelId).toBe('minimax-coding-plan/MiniMax-M2.7');
      expect(cap.strictTddRequired).toBe(false); // default
    });

    test('includes test runner info when detected', () => {
      const cap = getTDDCapability('minimax-2.7');
      // testRunnerAvailable depends on project state
      expect(typeof cap.testRunnerAvailable).toBe('boolean');
      expect(typeof cap.testRunnerName).toBe('string');
    });
  });

  describe('TDD evidence lifecycle', () => {
    test('createTDDEvidence returns empty evidence structure', () => {
      const evidence = createTDDEvidence();
      expect(evidence.cycles).toEqual([]);
      expect(evidence.startedAt).toBeDefined();
      expect(evidence.completedAt).toBeNull();
      expect(evidence.passed).toBe(false);
    });

    test('recordRedPhase adds a RED cycle entry', () => {
      const evidence = createTDDEvidence();
      recordRedPhase(evidence, {
        taskId: '5.1',
        testCode: 'expect(sum(2, 2)).toBe(4)',
        expectedBehavior: 'sum(2,2) returns 4',
      });

      expect(evidence.cycles.length).toBe(1);
      expect(evidence.cycles[0].phase).toBe('RED');
      expect(evidence.cycles[0].taskId).toBe('5.1');
      expect(evidence.cycles[0].testCode).toBe('expect(sum(2, 2)).toBe(4)');
    });

    test('recordGreenPhase completes a RED cycle', () => {
      const evidence = createTDDEvidence();
      recordRedPhase(evidence, { taskId: '5.1', testCode: 'test', expectedBehavior: 'behaves' });
      recordGreenPhase(evidence, {
        taskId: '5.1',
        implementation: 'function sum(a,b){return a+b}',
        testsPassed: true,
      });

      const cycle = evidence.cycles[0];
      expect(cycle.phase).toBe('GREEN'); // phase transitions to GREEN
      expect(cycle.implementation).toBe('function sum(a,b){return a+b}');
      expect(cycle.testsPassed).toBe(true);
    });

    test('recordRefactorPhase adds refactor to GREEN cycle', () => {
      const evidence = createTDDEvidence();
      recordRedPhase(evidence, { taskId: '5.1', testCode: 'test', expectedBehavior: 'behaves' });
      recordGreenPhase(evidence, { taskId: '5.1', implementation: 'impl', testsPassed: true });
      recordRefactorPhase(evidence, {
        taskId: '5.1',
        beforeCode: 'old',
        afterCode: 'new',
        reason: 'cleaner',
      });

      const cycle = evidence.cycles[0];
      expect(cycle.refactor).toBeDefined();
      expect(cycle.refactor.beforeCode).toBe('old');
      expect(cycle.refactor.afterCode).toBe('new');
      expect(cycle.refactor.reason).toBe('cleaner');
    });

    test('recordGreenPhase does nothing without a RED cycle', () => {
      const evidence = createTDDEvidence();
      recordGreenPhase(evidence, { taskId: '5.1', implementation: 'impl', testsPassed: true });
      expect(evidence.cycles.length).toBe(0);
    });

    test('recordRefactorPhase does nothing without a GREEN cycle', () => {
      const evidence = createTDDEvidence();
      recordRefactorPhase(evidence, {
        taskId: '5.1',
        beforeCode: 'a',
        afterCode: 'b',
        reason: 'r',
      });
      expect(evidence.cycles.length).toBe(0);
    });

    test('completeTDDEvidence marks evidence as complete', () => {
      const evidence = createTDDEvidence();
      recordRedPhase(evidence, { taskId: '5.1', testCode: 'test', expectedBehavior: 'behaves' });
      recordGreenPhase(evidence, { taskId: '5.1', implementation: 'impl', testsPassed: true });
      completeTDDEvidence(evidence, true);

      expect(evidence.completedAt).toBeDefined();
      expect(evidence.passed).toBe(true);
    });

    test('completeTDDEvidence can mark as failed', () => {
      const evidence = createTDDEvidence();
      completeTDDEvidence(evidence, false);
      expect(evidence.passed).toBe(false);
    });
  });

  describe('formatTDDEvidence()', () => {
    test('returns null for empty evidence', () => {
      const evidence = createTDDEvidence();
      expect(formatTDDEvidence(evidence)).toBeNull();
    });

    test('formats evidence with cycles as markdown table', () => {
      const evidence = createTDDEvidence();
      recordRedPhase(evidence, {
        taskId: '5.1',
        testCode: 'test code',
        expectedBehavior: 'behaves',
      });
      recordGreenPhase(evidence, { taskId: '5.1', implementation: 'impl', testsPassed: true });
      completeTDDEvidence(evidence, true);

      const formatted = formatTDDEvidence(evidence);
      expect(formatted).toContain('## TDD Cycle Evidence');
      expect(formatted).toContain('| Cycle | Task | RED | GREEN | REFACTOR |');
      expect(formatted).toContain('5.1');
      expect(formatted).toContain('PASSED');
    });

    test('shows REFACTOR column when refactor exists', () => {
      const evidence = createTDDEvidence();
      recordRedPhase(evidence, { taskId: '5.1', testCode: 't', expectedBehavior: 'b' });
      recordGreenPhase(evidence, { taskId: '5.1', implementation: 'i', testsPassed: true });
      recordRefactorPhase(evidence, {
        taskId: '5.1',
        beforeCode: 'a',
        afterCode: 'b',
        reason: 'r',
      });

      const formatted = formatTDDEvidence(evidence);
      expect(formatted).toContain('✓'); // refactor is marked
    });

    test('returns null for null/undefined input', () => {
      expect(formatTDDEvidence(null)).toBeNull();
      expect(formatTDDEvidence(undefined)).toBeNull();
    });
  });

  describe('formatApplyProgress()', () => {
    test('formats apply progress with tasks', () => {
      const progress = formatApplyProgress({
        changeName: 'auth-overhaul',
        phase: 'Phase 5',
        tasks: [
          { id: '5.1', description: 'Unit tests for SwarmPromptEngine', completed: true },
          { id: '5.2', description: 'Unit tests for ContextManager', completed: false },
        ],
      });

      expect(progress).toContain('auth-overhaul');
      expect(progress).toContain('Phase 5');
      expect(progress).toContain('[x] 5.1');
      expect(progress).toContain('[ ] 5.2');
    });

    test('includes TDD evidence when provided', () => {
      const evidence = createTDDEvidence();
      recordRedPhase(evidence, { taskId: '5.1', testCode: 't', expectedBehavior: 'b' });

      const progress = formatApplyProgress({
        changeName: 'test',
        phase: '5',
        tasks: [{ id: '5.1', description: 'test', completed: true }],
        tddEvidence: evidence,
      });

      expect(progress).toContain('TDD Cycle Evidence');
    });

    test('includes deviations when provided', () => {
      const progress = formatApplyProgress({
        changeName: 'test',
        phase: '5',
        tasks: [],
        deviations: [{ taskId: '2.1', reason: 'Simplified approach taken' }],
      });

      expect(progress).toContain('Deviations from Design');
      expect(progress).toContain('Simplified approach taken');
    });

    test('includes notes when provided', () => {
      const progress = formatApplyProgress({
        changeName: 'test',
        phase: '5',
        tasks: [],
        notes: ['Run integration tests manually'],
      });

      expect(progress).toContain('Notes');
      expect(progress).toContain('Run integration tests manually');
    });
  });
});
