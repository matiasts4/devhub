/**
 * Integration tests for MCP Swarm v2 and Planning/Context tools:
 *   - register_agent
 *   - heartbeat_agent
 *   - update_agent_status
 *   - unregister_agent
 *   - get_project_context
 *   - mark_planning_done
 *   - validate_topic_key
 *   - build_context_pack
 */

import { describe, it, expect, beforeAll, afterAll } from '@jest/globals';
import { createTestHarness } from '../test-harness.js';

describe('MCP Swarm & Planning Tools', () => {
  let harness;
  let projectId;

  beforeAll(async () => {
    harness = await createTestHarness();
    await harness.initialize();

    const projects = await harness.callTool('list_projects', { status: 'all' });
    if (projects.projects.length > 0) {
      projectId = projects.projects[0].id;
    }
  });

  afterAll(async () => {
    await harness.cleanup();
  });

  describe('register_agent', () => {
    it('registers a new agent', async () => {
      if (!projectId) {
        console.log('SKIP: no projects in DB');
        return;
      }
      const result = await harness.callTool('register_agent', {
        agent_id: 'test-agent-integration',
        project_id: projectId,
        nombre: 'Test Agent',
        modelo_llm: 'test-model',
      });
      expect(result.success).toBe(true);
      expect(result.agent.agent_id).toBe('test-agent-integration');
      expect(result.agent.status).toBe('idle');
    });

    it('updates an existing agent (upsert)', async () => {
      if (!projectId) return;
      const result = await harness.callTool('register_agent', {
        agent_id: 'test-agent-integration',
        project_id: projectId,
        nombre: 'Test Agent Updated',
        modelo_llm: 'new-model',
      });
      expect(result.success).toBe(true);
      expect(result.agent.nombre).toBe('Test Agent Updated');
    });
  });

  describe('heartbeat_agent', () => {
    it('renews agent heartbeat', async () => {
      const result = await harness.callTool('heartbeat_agent', {
        agent_id: 'test-agent-integration',
      });
      expect(result.success).toBe(true);
      expect(result.agent).toHaveProperty('last_heartbeat');
    });

    it('errors on non-existent agent', async () => {
      const result = await harness.callTool('heartbeat_agent', {
        agent_id: 'nonexistent-agent',
      });
      expect(result.raw).toContain('ERROR');
    });
  });

  describe('update_agent_status', () => {
    it('updates agent to working status', async () => {
      const result = await harness.callTool('update_agent_status', {
        agent_id: 'test-agent-integration',
        status: 'working',
        task_description: 'Running integration tests',
      });
      expect(result.success).toBe(true);
      expect(result.message).toBe('Estado actualizado en la UI');
    });

    it('maps running/active/thinking to working', async () => {
      const result = await harness.callTool('update_agent_status', {
        agent_id: 'test-agent-integration',
        status: 'running',
      });
      expect(result.success).toBe(true);
      expect(result.agent.status).toBe('working');
    });

    it('maps failed to error', async () => {
      const result = await harness.callTool('update_agent_status', {
        agent_id: 'test-agent-integration',
        status: 'failed',
      });
      expect(result.success).toBe(true);
      expect(result.agent.status).toBe('error');
    });
  });

  describe('unregister_agent', () => {
    it('removes an agent from registry', async () => {
      const result = await harness.callTool('unregister_agent', {
        agent_id: 'test-agent-integration',
      });
      expect(result.success).toBe(true);
    });

    it('errors when agent not found after deletion', async () => {
      const result = await harness.callTool('heartbeat_agent', {
        agent_id: 'test-agent-integration',
      });
      expect(result.raw).toContain('ERROR');
    });
  });

  describe('get_project_context', () => {
    it('returns project context with files', async () => {
      if (!projectId) return;
      const result = await harness.callTool('get_project_context', { project_id: projectId });
      expect(result).toHaveProperty('project');
      expect(result).toHaveProperty('files');
      expect(result).toHaveProperty('summary');
      expect(result.summary).toHaveProperty('total_files');
      expect(result.summary).toHaveProperty('total_chars');
      expect(result.summary).toHaveProperty('has_planning_prompt');
    });

    it('errors on invalid project_id', async () => {
      const result = await harness.callTool('get_project_context', {
        project_id: 'not-a-valid-id',
      });
      const text = result.raw || JSON.stringify(result);
      expect(text).toMatch(/ERROR|error|invalid/i);
    });
  });

  describe('mark_planning_done', () => {
    it('marks planning as completed', async () => {
      if (!projectId) return;
      const result = await harness.callTool('mark_planning_done', { project_id: projectId });
      expect(result.success).toBe(true);
      expect(result.project.planning_status).toBe('completed');
    });
  });

  describe('validate_topic_key', () => {
    it('validates a correct topic key', async () => {
      const result = await harness.callTool('validate_topic_key', {
        topic_key: 'architecture/auth-model',
      });
      expect(result.valid).toBe(true);
      expect(result.normalized_topic_key).toBe('architecture/auth-model');
    });

    it('rejects an invalid topic key', async () => {
      const result = await harness.callTool('validate_topic_key', {
        topic_key: 'INVALID KEY!!!',
      });
      expect(result.valid).toBe(false);
      expect(result).toHaveProperty('reason');
    });

    it('normalizes a topic key with spaces', async () => {
      const result = await harness.callTool('validate_topic_key', {
        topic_key: 'Architecture / Auth Model',
      });
      expect(result.normalized_topic_key).toBe('architecture-/-auth-model');
    });
  });

  describe('build_context_pack', () => {
    it('builds a context pack for a valid topic', async () => {
      if (!projectId) return;
      const result = await harness.callTool('build_context_pack', {
        project_id: projectId,
        objective: 'Documentar la arquitectura de autenticación',
        topic_key: 'architecture/auth-model',
        max_evidence: 5,
        max_tokens_context: 2000,
      });
      expect(result.success).toBe(true);
      expect(result.context_pack).toHaveProperty('objective');
      expect(result.context_pack).toHaveProperty('topic_key');
      expect(result.context_pack).toHaveProperty('retrieved_evidence');
      expect(result.context_pack).toHaveProperty('budget');
      expect(Array.isArray(result.context_pack.retrieved_evidence)).toBe(true);
    });

    it('errors on invalid topic_key', async () => {
      if (!projectId) return;
      const result = await harness.callTool('build_context_pack', {
        project_id: projectId,
        objective: 'Documentar la arquitectura de autenticación del sistema',
        topic_key: 'INVALID!!!',
      });
      const text = result.raw || JSON.stringify(result);
      expect(text).toMatch(/ERROR|error|invalid|topic_key/i);
    });
  });
});
