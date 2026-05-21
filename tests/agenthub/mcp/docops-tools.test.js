/**
 * Task 29: Test MCP DocOps tools
 *
 * Tests: validate_topic_key, build_context_pack
 * - Validate against existing DocOps system (src/lib/docopsPrompts.js, src/lib/docopsPolicy.js)
 */

const { McpTestHarness } = require('./harness');
const { seedProject, seedTask, seedMilestone } = require('../fixtures');
const { assertDbRow, assertDbRowCount } = require('../assertions');

describe('MCP DocOps Tools', () => {
  let harness;

  beforeEach(async () => {
    harness = new McpTestHarness();
    await harness.setup();
  });

  afterEach(async () => {
    await harness.teardown();
  });

  // ─── validate_topic_key ──────────────────────────────────────────

  describe('validate_topic_key', () => {
    test('validates a correct topic key', async () => {
      const result = await harness.invokeTool('validate_topic_key', {
        topic_key: 'frontend/testing/unit-tests',
      });
      const body = harness.assertToolResponse(result, [
        'topic_key',
        'normalized_topic_key',
        'valid',
        'reason',
        'regex',
      ]);

      expect(body.valid).toBe(true);
      expect(body.normalized_topic_key).toBe('frontend/testing/unit-tests');
      expect(body.reason).toBeNull();
      expect(body.regex).toBeDefined();
    });

    test('validates a two-segment topic key', async () => {
      const result = await harness.invokeTool('validate_topic_key', {
        topic_key: 'backend/api',
      });
      const body = harness.assertToolResponse(result, ['valid', 'normalized_topic_key']);

      expect(body.valid).toBe(true);
      expect(body.normalized_topic_key).toBe('backend/api');
    });

    test('validates a four-segment topic key (max depth)', async () => {
      const result = await harness.invokeTool('validate_topic_key', {
        topic_key: 'frontend/testing/unit-tests/jest-config',
      });
      const body = harness.assertToolResponse(result, ['valid', 'normalized_topic_key']);

      expect(body.valid).toBe(true);
      expect(body.normalized_topic_key).toBe('frontend/testing/unit-tests/jest-config');
    });

    test('normalizes uppercase to lowercase', async () => {
      const result = await harness.invokeTool('validate_topic_key', {
        topic_key: 'Frontend/Testing/Unit-Tests',
      });
      const body = harness.assertToolResponse(result, ['valid', 'normalized_topic_key']);

      expect(body.valid).toBe(true);
      expect(body.normalized_topic_key).toBe('frontend/testing/unit-tests');
    });

    test('normalizes spaces to hyphens', async () => {
      const result = await harness.invokeTool('validate_topic_key', {
        topic_key: 'frontend/testing/unit tests',
      });
      const body = harness.assertToolResponse(result, ['valid', 'normalized_topic_key']);

      expect(body.valid).toBe(true);
      expect(body.normalized_topic_key).toBe('frontend/testing/unit-tests');
    });

    test('normalizes multiple slashes to single slash', async () => {
      const result = await harness.invokeTool('validate_topic_key', {
        topic_key: 'frontend//testing///unit-tests',
      });
      const body = harness.assertToolResponse(result, ['valid', 'normalized_topic_key']);

      expect(body.valid).toBe(true);
      expect(body.normalized_topic_key).toBe('frontend/testing/unit-tests');
    });

    test('rejects single segment (no slash)', async () => {
      const result = await harness.invokeTool('validate_topic_key', {
        topic_key: 'just-one-segment',
      });
      const body = harness.assertToolResponse(result, ['valid', 'reason']);

      expect(body.valid).toBe(false);
      expect(body.reason).toBeDefined();
      expect(body.reason).toContain('Formato invalido');
    });

    test('rejects topic key with uppercase after normalization', async () => {
      // After normalization, if it still has invalid chars
      const result = await harness.invokeTool('validate_topic_key', {
        topic_key: 'a/b/c/d/e', // 5 segments - too many (max 4)
      });
      const body = harness.assertToolResponse(result, ['valid']);

      expect(body.valid).toBe(false);
    });

    test('rejects topic key with special characters', async () => {
      const result = await harness.invokeTool('validate_topic_key', {
        topic_key: 'frontend/testing/unit@tests',
      });
      const body = harness.assertToolResponse(result, ['valid', 'reason']);

      expect(body.valid).toBe(false);
      expect(body.reason).toContain('Formato invalido');
    });

    test('rejects topic key with underscores', async () => {
      const result = await harness.invokeTool('validate_topic_key', {
        topic_key: 'frontend/testing/unit_tests',
      });
      const body = harness.assertToolResponse(result, ['valid']);

      expect(body.valid).toBe(false);
    });

    test('returns regex pattern in response', async () => {
      const result = await harness.invokeTool('validate_topic_key', {
        topic_key: 'a/b',
      });
      const body = harness.assertToolResponse(result, ['regex']);

      // Should contain the regex source
      expect(typeof body.regex).toBe('string');
      expect(body.regex.length).toBeGreaterThan(0);
    });
  });

  // ─── build_context_pack ──────────────────────────────────────────

  describe('build_context_pack', () => {
    test('builds context pack with project, tasks, milestones', async () => {
      seedProject(harness.db, {
        id: 'proj-1',
        name: 'DocOps Project',
        description: 'A project for documentation testing',
        planning_prompt: 'Build a comprehensive testing system',
        documentation_policy: 'archive_only',
      });
      seedTask(harness.db, 'proj-1', {
        id: 'task-1',
        title: 'Implement tests',
        status: 'in_progress',
        priority: 'high',
      });
      seedMilestone(harness.db, 'proj-1', {
        id: 'ms-1',
        title: 'Testing Phase',
        status: 'in_progress',
      });

      const result = await harness.invokeTool('build_context_pack', {
        project_id: 'proj-1',
        objective: 'Create testing documentation',
        topic_key: 'frontend/testing/unit-tests',
      });
      const body = harness.assertToolResponse(result, ['success', 'context_pack', 'notes']);

      expect(body.success).toBe(true);
      expect(body.context_pack.objective).toBe('Create testing documentation');
      expect(body.context_pack.project_id).toBe('proj-1');
      expect(body.context_pack.topic_key).toBe('frontend/testing/unit-tests');
      expect(body.context_pack.retrieved_evidence).toBeDefined();
      expect(Array.isArray(body.context_pack.retrieved_evidence)).toBe(true);
      expect(body.context_pack.constraints).toBeDefined();
      expect(body.context_pack.documentation_policy).toBe('archive_only');
      expect(body.context_pack.documentation_policy_summary).toContain('archive_only');
      expect(body.context_pack.documentation_policy_metadata.mode).toBe('archive-first');
      expect(body.context_pack.constraints.join(' ')).toContain('Archivar primero');
      expect(body.context_pack.budget).toBeDefined();
      expect(body.context_pack.retrieval_order).toBeDefined();
      expect(body.context_pack.generated_at).toBeDefined();
    });

    test('context pack includes task evidence', async () => {
      seedProject(harness.db, { id: 'proj-1', name: 'Test' });
      seedTask(harness.db, 'proj-1', {
        id: 'task-1',
        title: 'Task A',
        status: 'completed',
      });
      seedTask(harness.db, 'proj-1', {
        id: 'task-2',
        title: 'Task B',
        status: 'pending',
      });

      const result = await harness.invokeTool('build_context_pack', {
        project_id: 'proj-1',
        objective: 'Document tasks',
        topic_key: 'project/tasks/overview',
      });
      const body = harness.assertToolResponse(result, ['success', 'context_pack']);

      const taskEvidence = body.context_pack.retrieved_evidence.filter((e) => e.type === 'task');
      expect(taskEvidence.length).toBeGreaterThan(0);
      expect(taskEvidence[0]).toHaveProperty('type', 'task');
      expect(taskEvidence[0]).toHaveProperty('id');
      expect(taskEvidence[0]).toHaveProperty('summary');
      expect(taskEvidence[0]).toHaveProperty('reason');
      expect(taskEvidence[0]).toHaveProperty('recency');
    });

    test('context pack includes milestone evidence', async () => {
      seedProject(harness.db, { id: 'proj-1', name: 'Test' });
      seedMilestone(harness.db, 'proj-1', {
        id: 'ms-1',
        title: 'Phase 1',
        status: 'completed',
      });

      const result = await harness.invokeTool('build_context_pack', {
        project_id: 'proj-1',
        objective: 'Document milestones',
        topic_key: 'project/milestones/phase1',
      });
      const body = harness.assertToolResponse(result, ['success', 'context_pack']);

      const msEvidence = body.context_pack.retrieved_evidence.filter((e) => e.type === 'milestone');
      expect(msEvidence.length).toBeGreaterThan(0);
      expect(msEvidence[0]).toHaveProperty('type', 'milestone');
      expect(msEvidence[0]).toHaveProperty('summary');
    });

    test('context pack includes agent_memory evidence', async () => {
      seedProject(harness.db, { id: 'proj-1', name: 'Test' });

      // Insert agent memory directly
      harness.db
        .prepare(
          `INSERT INTO agent_memory (id, project_id, agent_id, key, tipo, value, created_at)
         VALUES (?, ?, ?, ?, ?, ?, datetime('now'))`
        )
        .run(
          'mem-1',
          'proj-1',
          'agent-1',
          'testing/best-practices',
          'convention',
          'Always use describe blocks'
        );

      const result = await harness.invokeTool('build_context_pack', {
        project_id: 'proj-1',
        objective: 'Document best practices',
        topic_key: 'testing/best-practices',
      });
      const body = harness.assertToolResponse(result, ['success', 'context_pack']);

      const memEvidence = body.context_pack.retrieved_evidence.filter((e) => e.type === 'memory');
      expect(memEvidence.length).toBeGreaterThan(0);
      expect(memEvidence[0]).toHaveProperty('type', 'memory');
      expect(memEvidence[0]).toHaveProperty('summary');
    });

    test('respects max_evidence limit', async () => {
      seedProject(harness.db, { id: 'proj-1', name: 'Test' });

      // Create many tasks
      for (let i = 1; i <= 10; i++) {
        seedTask(harness.db, 'proj-1', {
          id: `task-${i}`,
          title: `Task ${i}`,
          status: 'pending',
        });
      }

      const result = await harness.invokeTool('build_context_pack', {
        project_id: 'proj-1',
        objective: 'Document many tasks',
        topic_key: 'project/tasks/overview',
        max_evidence: 5,
      });
      const body = harness.assertToolResponse(result, ['success', 'context_pack']);

      expect(body.context_pack.retrieved_evidence.length).toBeLessThanOrEqual(5);
    });

    test('returns error for invalid topic_key', async () => {
      seedProject(harness.db, { id: 'proj-1', name: 'Test' });

      const result = await harness.invokeTool('build_context_pack', {
        project_id: 'proj-1',
        objective: 'Test invalid key',
        topic_key: 'invalid key with spaces and no/slashes/format',
      });

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('topic_key invalida');
    });

    test('returns error for non-existent project', async () => {
      const result = await harness.invokeTool('build_context_pack', {
        project_id: '00000000-0000-0000-0000-000000000000',
        objective: 'Test missing project',
        topic_key: 'test/missing/project',
      });

      expect(result.isError).toBe(true);
    });

    test('context pack includes budget with token estimation', async () => {
      seedProject(harness.db, {
        id: 'proj-1',
        name: 'Test',
        description: 'A test project for budget calculation',
      });

      const result = await harness.invokeTool('build_context_pack', {
        project_id: 'proj-1',
        objective: 'Calculate token budget',
        topic_key: 'project/budget/tokens',
        max_tokens_context: 4000,
      });
      const body = harness.assertToolResponse(result, ['success', 'context_pack']);

      expect(body.context_pack.budget.max_tokens_context).toBe(4000);
      expect(body.context_pack.budget.estimated_tokens).toBeGreaterThan(0);
      expect(body.context_pack.budget.max_expansions).toBe(2);
      expect(body.context_pack.budget.expansion_step_tokens).toBe(1000);
    });

    test('context pack includes current_canonical_summary from planning_prompt', async () => {
      seedProject(harness.db, {
        id: 'proj-1',
        name: 'Test',
        planning_prompt:
          'This is a detailed planning prompt that should be used as the canonical summary for the context pack',
      });

      const result = await harness.invokeTool('build_context_pack', {
        project_id: 'proj-1',
        objective: 'Test canonical summary',
        topic_key: 'test/canonical/summary',
      });
      const body = harness.assertToolResponse(result, ['success', 'context_pack']);

      expect(body.context_pack.current_canonical_summary).toContain(
        'This is a detailed planning prompt'
      );
    });

    test('context pack falls back to description when no planning_prompt', async () => {
      seedProject(harness.db, {
        id: 'proj-1',
        name: 'Test',
        description: 'Fallback description',
      });

      const result = await harness.invokeTool('build_context_pack', {
        project_id: 'proj-1',
        objective: 'Test fallback',
        topic_key: 'test/fallback/description',
      });
      const body = harness.assertToolResponse(result, ['success', 'context_pack']);

      expect(body.context_pack.current_canonical_summary).toBe('Fallback description');
    });

    test('context pack includes open_questions when no evidence', async () => {
      seedProject(harness.db, { id: 'proj-1', name: 'Empty Project' });

      const result = await harness.invokeTool('build_context_pack', {
        project_id: 'proj-1',
        objective: 'Test empty evidence',
        topic_key: 'test/empty/evidence',
      });
      const body = harness.assertToolResponse(result, ['success', 'context_pack']);

      expect(body.context_pack.open_questions.length).toBeGreaterThan(0);
      expect(body.context_pack.open_questions[0]).toContain('No hay evidencia suficiente');
    });

    test('context pack clarifies when documentation policy is missing', async () => {
      seedProject(harness.db, { id: 'proj-1', name: 'Legacy Project' });

      const result = await harness.invokeTool('build_context_pack', {
        project_id: 'proj-1',
        objective: 'Document legacy project',
        topic_key: 'project/legacy/docs',
      });
      const body = harness.assertToolResponse(result, ['success', 'context_pack']);

      expect(body.context_pack.documentation_policy).toBe('unknown');
      expect(body.context_pack.documentation_policy_metadata.requires_user_clarification).toBe(
        true
      );
      expect(body.context_pack.constraints.join(' ')).toContain('pedile aclaración');
    });

    test('evidence is sorted by recency (most recent first)', async () => {
      seedProject(harness.db, { id: 'proj-1', name: 'Test' });
      seedTask(harness.db, 'proj-1', {
        id: 'task-1',
        title: 'Old Task',
        status: 'completed',
      });
      seedTask(harness.db, 'proj-1', {
        id: 'task-2',
        title: 'New Task',
        status: 'pending',
      });

      // Update task-1 to make it more recent
      harness.db
        .prepare("UPDATE tasks SET updated_at = datetime('now', '-1 day') WHERE id = 'task-1'")
        .run();

      const result = await harness.invokeTool('build_context_pack', {
        project_id: 'proj-1',
        objective: 'Test recency sorting',
        topic_key: 'test/recency/sorting',
      });
      const body = harness.assertToolResponse(result, ['success', 'context_pack']);

      const taskEvidence = body.context_pack.retrieved_evidence.filter((e) => e.type === 'task');
      if (taskEvidence.length >= 2) {
        // Most recent should be first
        expect(taskEvidence[0].id).toBe('task-2');
      }
    });
  });
});
