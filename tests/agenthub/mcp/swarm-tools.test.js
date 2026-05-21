/**
 * Task 28: Test MCP swarm v2 tools
 *
 * Tests: register_agent, heartbeat_agent, unregister_agent, update_agent_status
 * - Verify agent_registry table changes
 * - Test concurrency limits
 */

const { McpTestHarness } = require('./harness');
const { seedProject, seedSwarmConfig } = require('../fixtures');
const { assertDbRow, assertDbRowCount } = require('../assertions');

describe('MCP Swarm v2 Tools', () => {
  let harness;

  beforeEach(async () => {
    harness = new McpTestHarness();
    await harness.setup();
  });

  afterEach(async () => {
    await harness.teardown();
  });

  // ─── register_agent ──────────────────────────────────────────────

  describe('register_agent', () => {
    test('registers a new agent', async () => {
      seedProject(harness.db, { id: 'proj-1', name: 'Test' });

      const result = await harness.invokeTool('register_agent', {
        agent_id: 'worker-claude-1',
        project_id: 'proj-1',
        nombre: 'Claude Worker 1',
        modelo_llm: 'claude-sonnet-4-5-20250514',
      });
      const body = harness.assertToolResponse(result, ['success', 'agent']);

      expect(body.success).toBe(true);
      expect(body.agent.agent_id).toBe('worker-claude-1');
      expect(body.agent.project_id).toBe('proj-1');
      expect(body.agent.nombre).toBe('Claude Worker 1');
      expect(body.agent.modelo_llm).toBe('claude-sonnet-4-5-20250514');
      expect(body.agent.status).toBe('idle');
      expect(body.agent.last_heartbeat).toBeDefined();

      // Verify DB state
      assertDbRow(
        harness.db,
        'agent_registry',
        { agent_id: 'worker-claude-1' },
        {
          project_id: 'proj-1',
          nombre: 'Claude Worker 1',
          status: 'idle',
        }
      );
    });

    test('upserts existing agent (update on conflict)', async () => {
      seedProject(harness.db, { id: 'proj-1', name: 'Test' });

      // First registration
      await harness.invokeTool('register_agent', {
        agent_id: 'worker-1',
        project_id: 'proj-1',
        nombre: 'Worker One',
        modelo_llm: 'model-a',
      });

      // Re-register with different model
      const result = await harness.invokeTool('register_agent', {
        agent_id: 'worker-1',
        project_id: 'proj-1',
        nombre: 'Worker One',
        modelo_llm: 'model-b',
      });
      const body = harness.assertToolResponse(result, ['success', 'agent']);

      expect(body.agent.modelo_llm).toBe('model-b');
      expect(body.agent.status).toBe('idle');

      // Should still be only 1 row
      assertDbRowCount(harness.db, 'agent_registry', { agent_id: 'worker-1' }, 1);
    });

    test('registers agent without modelo_llm', async () => {
      seedProject(harness.db, { id: 'proj-1', name: 'Test' });

      const result = await harness.invokeTool('register_agent', {
        agent_id: 'worker-no-model',
        project_id: 'proj-1',
        nombre: 'No Model Worker',
      });
      const body = harness.assertToolResponse(result, ['success', 'agent']);

      expect(body.success).toBe(true);
      expect(body.agent.modelo_llm).toBeUndefined();
    });
  });

  // ─── heartbeat_agent ─────────────────────────────────────────────

  describe('heartbeat_agent', () => {
    test('updates last_heartbeat for registered agent', async () => {
      seedProject(harness.db, { id: 'proj-1', name: 'Test' });

      await harness.invokeTool('register_agent', {
        agent_id: 'worker-1',
        project_id: 'proj-1',
        nombre: 'Worker',
      });

      const before = harness.db
        .prepare("SELECT last_heartbeat FROM agent_registry WHERE agent_id = 'worker-1'")
        .get();

      // Small delay to ensure different timestamp
      await new Promise((r) => setTimeout(r, 10));

      const result = await harness.invokeTool('heartbeat_agent', { agent_id: 'worker-1' });
      const body = harness.assertToolResponse(result, ['success', 'agent']);

      expect(body.success).toBe(true);
      expect(body.agent.last_heartbeat).toBeDefined();
      expect(body.agent.last_heartbeat).not.toBe(before.last_heartbeat);
    });

    test('returns error for unregistered agent', async () => {
      const result = await harness.invokeTool('heartbeat_agent', {
        agent_id: 'non-existent-agent',
      });

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('no encontrado');
    });
  });

  // ─── unregister_agent ────────────────────────────────────────────

  describe('unregister_agent', () => {
    test('removes agent from registry', async () => {
      seedProject(harness.db, { id: 'proj-1', name: 'Test' });

      await harness.invokeTool('register_agent', {
        agent_id: 'worker-to-remove',
        project_id: 'proj-1',
        nombre: 'Remove Me',
      });

      assertDbRowCount(harness.db, 'agent_registry', {}, 1);

      const result = await harness.invokeTool('unregister_agent', {
        agent_id: 'worker-to-remove',
      });
      const body = harness.assertToolResponse(result, ['success', 'message']);

      expect(body.success).toBe(true);
      expect(body.message).toContain('eliminado');

      // Verify DB state
      assertDbRowCount(harness.db, 'agent_registry', {}, 0);
    });

    test('unregistering non-existent agent returns success (no-op)', async () => {
      const result = await harness.invokeTool('unregister_agent', {
        agent_id: 'ghost-agent',
      });
      const body = harness.assertToolResponse(result, ['success', 'message']);

      expect(body.success).toBe(true);
    });
  });

  // ─── update_agent_status ─────────────────────────────────────────

  describe('update_agent_status', () => {
    test('updates agent status to working', async () => {
      seedProject(harness.db, { id: 'proj-1', name: 'Test' });

      await harness.invokeTool('register_agent', {
        agent_id: 'worker-1',
        project_id: 'proj-1',
        nombre: 'Worker',
      });

      const result = await harness.invokeTool('update_agent_status', {
        agent_id: 'worker-1',
        status: 'working',
        task_description: 'Implementing feature X',
      });
      const body = harness.assertToolResponse(result, ['success', 'message', 'agent']);

      expect(body.success).toBe(true);
      expect(body.message).toBe('Estado actualizado en la UI');
      expect(body.agent.status).toBe('working');

      assertDbRow(
        harness.db,
        'agent_registry',
        { agent_id: 'worker-1' },
        {
          status: 'working',
        }
      );
    });

    test('maps "running" status to "working"', async () => {
      seedProject(harness.db, { id: 'proj-1', name: 'Test' });

      await harness.invokeTool('register_agent', {
        agent_id: 'worker-1',
        project_id: 'proj-1',
        nombre: 'Worker',
      });

      const result = await harness.invokeTool('update_agent_status', {
        agent_id: 'worker-1',
        status: 'running',
      });
      const body = harness.assertToolResponse(result, ['success', 'agent']);

      expect(body.agent.status).toBe('working');
    });

    test('maps "thinking" status to "working"', async () => {
      seedProject(harness.db, { id: 'proj-1', name: 'Test' });

      await harness.invokeTool('register_agent', {
        agent_id: 'worker-1',
        project_id: 'proj-1',
        nombre: 'Worker',
      });

      const result = await harness.invokeTool('update_agent_status', {
        agent_id: 'worker-1',
        status: 'thinking',
      });
      const body = harness.assertToolResponse(result, ['success', 'agent']);

      expect(body.agent.status).toBe('working');
    });

    test('maps "completed" status to "idle"', async () => {
      seedProject(harness.db, { id: 'proj-1', name: 'Test' });

      await harness.invokeTool('register_agent', {
        agent_id: 'worker-1',
        project_id: 'proj-1',
        nombre: 'Worker',
      });

      const result = await harness.invokeTool('update_agent_status', {
        agent_id: 'worker-1',
        status: 'completed',
      });
      const body = harness.assertToolResponse(result, ['success', 'agent']);

      expect(body.agent.status).toBe('idle');
    });

    test('maps "failed" status to "error"', async () => {
      seedProject(harness.db, { id: 'proj-1', name: 'Test' });

      await harness.invokeTool('register_agent', {
        agent_id: 'worker-1',
        project_id: 'proj-1',
        nombre: 'Worker',
      });

      const result = await harness.invokeTool('update_agent_status', {
        agent_id: 'worker-1',
        status: 'failed',
      });
      const body = harness.assertToolResponse(result, ['success', 'agent']);

      expect(body.agent.status).toBe('error');
    });

    test('updates last_heartbeat on status change', async () => {
      seedProject(harness.db, { id: 'proj-1', name: 'Test' });

      await harness.invokeTool('register_agent', {
        agent_id: 'worker-1',
        project_id: 'proj-1',
        nombre: 'Worker',
      });

      const before = harness.db
        .prepare("SELECT last_heartbeat FROM agent_registry WHERE agent_id = 'worker-1'")
        .get();

      await new Promise((r) => setTimeout(r, 10));

      await harness.invokeTool('update_agent_status', {
        agent_id: 'worker-1',
        status: 'working',
      });

      const after = harness.db
        .prepare("SELECT last_heartbeat FROM agent_registry WHERE agent_id = 'worker-1'")
        .get();

      expect(after.last_heartbeat).not.toBe(before.last_heartbeat);
    });

    test('returns error for unregistered agent', async () => {
      const result = await harness.invokeTool('update_agent_status', {
        agent_id: 'ghost-agent',
        status: 'working',
      });

      expect(result.isError).toBe(true);
    });
  });

  // ─── Concurrency / multi-agent tests ─────────────────────────────

  describe('concurrency and multi-agent', () => {
    test('multiple agents can be registered for the same project', async () => {
      seedProject(harness.db, { id: 'proj-1', name: 'Test' });

      await harness.invokeTool('register_agent', {
        agent_id: 'worker-1',
        project_id: 'proj-1',
        nombre: 'Worker 1',
      });
      await harness.invokeTool('register_agent', {
        agent_id: 'worker-2',
        project_id: 'proj-1',
        nombre: 'Worker 2',
      });
      await harness.invokeTool('register_agent', {
        agent_id: 'worker-3',
        project_id: 'proj-1',
        nombre: 'Worker 3',
      });

      assertDbRowCount(harness.db, 'agent_registry', { project_id: 'proj-1' }, 3);
    });

    test('agents for different projects are independent', async () => {
      seedProject(harness.db, { id: 'proj-a', name: 'Project A' });
      seedProject(harness.db, { id: 'proj-b', name: 'Project B' });

      await harness.invokeTool('register_agent', {
        agent_id: 'worker-a',
        project_id: 'proj-a',
        nombre: 'Worker A',
      });
      await harness.invokeTool('register_agent', {
        agent_id: 'worker-b',
        project_id: 'proj-b',
        nombre: 'Worker B',
      });

      assertDbRowCount(harness.db, 'agent_registry', { project_id: 'proj-a' }, 1);
      assertDbRowCount(harness.db, 'agent_registry', { project_id: 'proj-b' }, 1);
    });

    test('register → heartbeat → update → unregister full lifecycle', async () => {
      seedProject(harness.db, { id: 'proj-1', name: 'Test' });

      // Register
      const regResult = await harness.invokeTool('register_agent', {
        agent_id: 'lifecycle-agent',
        project_id: 'proj-1',
        nombre: 'Lifecycle Agent',
      });
      harness.assertToolResponse(regResult, ['success', 'agent']);

      // Heartbeat
      const hbResult = await harness.invokeTool('heartbeat_agent', {
        agent_id: 'lifecycle-agent',
      });
      harness.assertToolResponse(hbResult, ['success', 'agent']);

      // Update status
      const updateResult = await harness.invokeTool('update_agent_status', {
        agent_id: 'lifecycle-agent',
        status: 'working',
        task_description: 'Working on task',
      });
      harness.assertToolResponse(updateResult, ['success', 'agent']);

      // Verify DB state
      assertDbRow(
        harness.db,
        'agent_registry',
        { agent_id: 'lifecycle-agent' },
        {
          status: 'working',
          project_id: 'proj-1',
        }
      );

      // Unregister
      const unregResult = await harness.invokeTool('unregister_agent', {
        agent_id: 'lifecycle-agent',
      });
      harness.assertToolResponse(unregResult, ['success', 'message']);

      // Verify removed
      assertDbRowCount(harness.db, 'agent_registry', { agent_id: 'lifecycle-agent' }, 0);
    });
  });
});
