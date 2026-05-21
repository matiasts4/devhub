/**
 * Integration tests for MCP Task tools:
 *   - list_tasks
 *   - create_task
 *   - bulk_create_tasks
 *   - update_task
 *   - add_task_comment
 *   - get_next_task
 *   - get_execution_queue
 *   - claim_next_task
 */

import { describe, it, expect, beforeAll, afterAll } from '@jest/globals';
import { createTestHarness } from '../test-harness.js';

describe('MCP Task Tools', () => {
  let harness;
  let projectId;
  let userId;
  let createdTaskId;
  let isolatedProjectId;

  async function createCheckpointProject(name) {
    const result = await harness.callTool('create_project', { name });
    return result.project.id;
  }

  async function findTaskById(targetTaskId, targetProjectId = isolatedProjectId) {
    const result = await harness.callTool('list_tasks', {
      project_id: targetProjectId,
      status: 'all',
    });
    return result.tasks.find((task) => task.id === targetTaskId) || null;
  }

  beforeAll(async () => {
    harness = await createTestHarness();
    await harness.initialize();

    // Get a real project to work with
    const projects = await harness.callTool('list_projects', { status: 'all' });
    if (projects.projects.length > 0) {
      projectId = projects.projects[0].id;
    }
    userId = '54fee7d7-340d-4683-b259-b61a39567f94'; // Standard test user
    const isolatedProject = await harness.callTool('create_project', {
      name: 'Supervisor Contract Integration Project',
    });
    isolatedProjectId = isolatedProject.project.id;
  });

  afterAll(async () => {
    await harness.cleanup();
  });

  describe('list_tasks', () => {
    it('returns tasks for a project', async () => {
      if (!projectId) {
        console.log('SKIP: no projects in DB');
        return;
      }
      const result = await harness.callTool('list_tasks', {
        project_id: projectId,
        status: 'all',
      });
      expect(result).toHaveProperty('tasks');
      expect(Array.isArray(result.tasks)).toBe(true);
    });

    it('filters by status', async () => {
      if (!projectId) return;
      const result = await harness.callTool('list_tasks', {
        project_id: projectId,
        status: 'pending',
      });
      expect(result.tasks.every((t) => t.status === 'pending')).toBe(true);
    });

    it('filters by priority', async () => {
      if (!projectId) return;
      const result = await harness.callTool('list_tasks', {
        project_id: projectId,
        priority: 'high',
      });
      expect(result.tasks.every((t) => t.priority === 'high')).toBe(true);
    });
  });

  describe('create_task', () => {
    it('creates a task with required fields', async () => {
      if (!projectId) {
        console.log('SKIP: no projects in DB');
        return;
      }
      const result = await harness.callTool('create_task', {
        project_id: projectId,
        user_id: userId,
        title: 'Test Task - Integration',
      });
      expect(result.created).toBe(true);
      expect(result.task).toHaveProperty('id');
      expect(result.task.title).toBe('Test Task - Integration');
      expect(result.task.status).toBe('pending');
      expect(result.task.priority).toBe('medium');
      createdTaskId = result.task.id;
    });

    it('creates a task with all optional fields', async () => {
      if (!projectId) return;
      const result = await harness.callTool('create_task', {
        project_id: projectId,
        user_id: userId,
        title: 'Full Task',
        description: 'A task with everything',
        status: 'in_progress',
        priority: 'critical',
        due_date: '2026-12-31',
      });
      expect(result.created).toBe(true);
      expect(result.task.priority).toBe('critical');
      expect(result.task.status).toBe('in_progress');
    });

    it('errors on missing required fields', async () => {
      const result = await harness.callTool('create_task', {
        project_id: projectId,
      });
      const text = result.raw || JSON.stringify(result);
      expect(text).toMatch(/ERROR|error|required|invalid/i);
    });
  });

  describe('bulk_create_tasks', () => {
    it('creates multiple tasks idempotently and skips duplicate titles', async () => {
      if (!projectId) return;
      const first = await harness.callTool('bulk_create_tasks', {
        project_id: projectId,
        user_id: userId,
        tasks: [
          { title: 'Bulk Task A', priority: 'high', business_value: 8 },
          { title: 'Bulk Task B', priority: 'low', business_value: 2 },
        ],
      });
      expect(first.created_count).toBe(2);

      const second = await harness.callTool('bulk_create_tasks', {
        project_id: projectId,
        user_id: userId,
        tasks: [
          { title: 'Bulk Task A', priority: 'critical' },
          { title: 'Bulk Task C', priority: 'medium' },
        ],
      });
      expect(second.created_count).toBe(1);
      expect(second.skipped_count).toBe(1);
      expect(second.skipped[0].reason).toBe('duplicate-title');
    });
  });

  describe('update_task', () => {
    it('updates task status', async () => {
      if (!createdTaskId) {
        console.log('SKIP: no task created');
        return;
      }
      await harness.callTool('add_task_comment', {
        task_id: createdTaskId,
        content:
          '[git:checkpoint] commit=abc1234 worktree=clean summary="task completed" docs=[none] checks=[targeted-review]',
        author_type: 'agent',
      });
      const result = await harness.callTool('update_task', {
        task_id: createdTaskId,
        status: 'completed',
      });
      expect(result.updated).toBe(true);
      expect(result.task.status).toBe('completed');
    });

    it('updates task priority and title', async () => {
      if (!createdTaskId) return;
      const result = await harness.callTool('update_task', {
        task_id: createdTaskId,
        title: 'Updated Title',
        priority: 'high',
      });
      expect(result.updated).toBe(true);
      expect(result.task.title).toBe('Updated Title');
      expect(result.task.priority).toBe('high');
    });

    it('rejects completed without an auditable git checkpoint comment', async () => {
      const testProjectId = await createCheckpointProject('Checkpoint gate rejection project');

      const taskResult = await harness.callTool('create_task', {
        project_id: testProjectId,
        user_id: userId,
        title: 'Implement gate without checkpoint',
        description: 'Normal code task with file changes expected.',
      });

      const result = await harness.callTool('update_task', {
        task_id: taskResult.task.id,
        status: 'completed',
      });

      expect(result.raw || JSON.stringify(result)).toMatch(/checkpoint/i);
      expect(result.raw || JSON.stringify(result)).toMatch(/git:checkpoint/i);

      const storedTask = await findTaskById(taskResult.task.id, testProjectId);
      expect(storedTask?.status).toBe('pending');
    });

    it('accepts completed when the latest git checkpoint is complete and auditable', async () => {
      const testProjectId = await createCheckpointProject('Checkpoint gate acceptance project');

      const taskResult = await harness.callTool('create_task', {
        project_id: testProjectId,
        user_id: userId,
        title: 'Implement durable checkpoint gate',
        description: 'Normal implementation task with changed files.',
      });

      await harness.callTool('add_task_comment', {
        task_id: taskResult.task.id,
        content:
          '[git:checkpoint] commit=abc1234 worktree=clean summary="durable gate ready" docs=[docs/24_Politica_Git_y_Versionado_Agentes.md] checks=[npm test -- src/app/api/agent/qa-result/route.test.js]',
        author_type: 'agent',
      });

      const result = await harness.callTool('update_task', {
        task_id: taskResult.task.id,
        status: 'completed',
      });

      expect(result.updated).toBe(true);
      expect(result.task.status).toBe('completed');
      expect(result.task.checkpoint_gate).toEqual(
        expect.objectContaining({
          status: 'accepted',
          code: 'checkpoint-accepted',
          checkpoint: expect.objectContaining({
            commit: 'abc1234',
            worktree: 'clean',
          }),
        })
      );
    });

    it('rejects completed when the latest git checkpoint omits a required field and names it', async () => {
      const testProjectId = await createCheckpointProject('Checkpoint incomplete evidence project');

      const taskResult = await harness.callTool('create_task', {
        project_id: testProjectId,
        user_id: userId,
        title: 'Implement checkpoint docs reminder',
        description: 'Normal implementation task with changed files.',
      });

      await harness.callTool('add_task_comment', {
        task_id: taskResult.task.id,
        content:
          '[git:checkpoint] commit=abc1234 worktree=clean summary="docs omitted on purpose" checks=[npm test -- tests/integration/tasks.test.js]',
        author_type: 'agent',
      });

      const result = await harness.callTool('update_task', {
        task_id: taskResult.task.id,
        status: 'completed',
      });

      expect(result.raw || JSON.stringify(result)).toMatch(/checkpoint est[aá] incompleto/i);
      expect(result.raw || JSON.stringify(result)).toMatch(/docs/i);

      const storedTask = await findTaskById(taskResult.task.id, testProjectId);
      expect(storedTask?.status).toBe('pending');
    });

    it('accepts commit=none only for zero-change analysis tasks', async () => {
      const testProjectId = await createCheckpointProject('Checkpoint analysis-only project');

      const taskResult = await harness.callTool('create_task', {
        project_id: testProjectId,
        user_id: userId,
        title: 'Queue latency analysis',
        description: 'Analysis only investigation with zero file changes.',
      });

      await harness.callTool('add_task_comment', {
        task_id: taskResult.task.id,
        content:
          '[git:checkpoint] commit=none worktree=clean summary="analysis only" docs=[none] checks=[targeted-review] reason="sin cambios de archivos"',
        author_type: 'agent',
      });

      const result = await harness.callTool('update_task', {
        task_id: taskResult.task.id,
        status: 'completed',
      });

      expect(result.updated).toBe(true);
      expect(result.task.status).toBe('completed');
      expect(result.task.checkpoint_gate).toEqual(
        expect.objectContaining({
          status: 'accepted',
          checkpoint: expect.objectContaining({ commit: 'none' }),
        })
      );
    });

    it('rejects commit=none when the checkpoint shows changed work and explains the remediation', async () => {
      const testProjectId = await createCheckpointProject(
        'Checkpoint changed work rejection project'
      );

      const taskResult = await harness.callTool('create_task', {
        project_id: testProjectId,
        user_id: userId,
        title: 'Implement queue remediation UI',
        description: 'Normal implementation task with changed files.',
      });

      await harness.callTool('add_task_comment', {
        task_id: taskResult.task.id,
        content:
          '[git:checkpoint] commit=none worktree=clean summary="changed work attempted" docs=[src/views/SwarmControl.jsx] checks=[npm test -- src/views/__tests__/SwarmControl.test.jsx] reason="forgot local commit"',
        author_type: 'agent',
      });

      const result = await harness.callTool('update_task', {
        task_id: taskResult.task.id,
        status: 'completed',
      });

      expect(result.raw || JSON.stringify(result)).toMatch(/commit=none/i);
      expect(result.raw || JSON.stringify(result)).toMatch(/local checkpoint commit/i);

      const storedTask = await findTaskById(taskResult.task.id, testProjectId);
      expect(storedTask?.status).toBe('pending');
    });
  });

  describe('add_task_comment', () => {
    it('adds a comment to a task', async () => {
      if (!createdTaskId) return;
      const result = await harness.callTool('add_task_comment', {
        task_id: createdTaskId,
        content: 'Integration test comment',
        author_type: 'agent',
      });
      expect(result.created).toBe(true);
      expect(result.comment.content).toBe('Integration test comment');
    });
  });

  describe('get_next_task', () => {
    it('returns a tokenized lease or null message', async () => {
      if (!projectId) return;
      const result = await harness.callTool('get_next_task', {
        project_id: projectId,
        agent_id: 'test-agent',
      });
      // Either returns a task or a message
      expect(result).toHaveProperty('message');
      if (result.task) {
        expect(result.task).toHaveProperty('id');
        expect(result.task).toHaveProperty('title');
        expect(result.task.status).toBe('in_progress');
        expect(result.task.assigned_to).toBe('test-agent');
        expect(result.task).toHaveProperty('claim_token');
        expect(result.task).toHaveProperty('claimed_at');
        expect(result.task).toHaveProperty('lease_expires_at');
      }
    });
  });

  describe('get_execution_queue / claim_next_task', () => {
    it('returns a scored pending-task queue', async () => {
      if (!projectId) return;
      const result = await harness.callTool('get_execution_queue', {
        project_id: projectId,
        limit: 5,
      });
      expect(result).toHaveProperty('queue');
      expect(Array.isArray(result.queue)).toBe(true);
      if (result.queue.length > 0) {
        expect(result.queue[0]).toHaveProperty('priority_score');
        expect(result.queue[0].status).toBe('pending');
      }
    });

    it('claims the next available task for an agent', async () => {
      if (!projectId) return;
      const result = await harness.callTool('claim_next_task', {
        project_id: projectId,
        agent_id: 'test-agent-claim',
      });
      expect(result).toHaveProperty('claimed');
      if (result.claimed) {
        expect(result.task.status).toBe('in_progress');
        expect(result.task.assigned_to).toBe('test-agent-claim');
        expect(result.task).toHaveProperty('claim_token');
        expect(result.task).toHaveProperty('lease_expires_at');
      }
    });

    it('renews and releases a claimed lease', async () => {
      if (!projectId) return;

      const claimed = await harness.callTool('claim_next_task', {
        project_id: projectId,
        agent_id: 'test-agent-renew',
      });

      if (!claimed.claimed || !claimed.task?.claim_token) {
        expect(claimed).toHaveProperty('message');
        return;
      }

      const renewed = await harness.callTool('renew_task_lease', {
        task_id: claimed.task.id,
        agent_id: 'test-agent-renew',
        claim_token: claimed.task.claim_token,
      });

      expect(renewed.renewed).toBe(true);
      expect(new Date(renewed.task.lease_expires_at).getTime()).toBeGreaterThanOrEqual(
        new Date(claimed.task.lease_expires_at).getTime()
      );

      const released = await harness.callTool('release_task', {
        task_id: claimed.task.id,
        agent_id: 'test-agent-renew',
        claim_token: claimed.task.claim_token,
        outcome: 'paused',
      });

      expect(released.released).toBe(true);
      expect(released.task.status).toBe('pending');
      expect(released.task.claim_token).toBeNull();
    });

    it('surfaces supervisor snapshots with reason/evidence fields in queue and task claims', async () => {
      if (!isolatedProjectId) return;

      const taskResult = await harness.callTool('create_task', {
        project_id: isolatedProjectId,
        user_id: userId,
        title: 'Supervisor Contract Task',
      });

      const workspaceResult = await harness.callTool('create_agent_workspace', {
        workspace_id: 'ws-supervisor-contract-1',
        project_id: isolatedProjectId,
        agent_id: 'agent-supervisor-contract-1',
        current_task_id: taskResult.task.id,
        run_id_or_session_id: 'session-supervisor-contract-1',
        repo_root: '/repo/devhub',
        workspace_path: 'workspace://devhub/ws-supervisor-contract-1',
        base_branch: 'main',
        status: 'planned',
      });

      const runResult = await harness.callTool('create_agent_run', {
        run_id: 'run-supervisor-contract-1',
        workspace_id: workspaceResult.workspace.id,
        task_id: taskResult.task.id,
        agent_id: 'agent-supervisor-contract-1',
        requested_base_ref: 'f814998dd05cb491caf8637bf570dbd74b539090',
        baseline_commit: 'f814998dd05cb491caf8637bf570dbd74b539090',
        status: 'running',
      });

      const checkpoint = await harness.callTool('request_supervisor_approval', {
        task_id: taskResult.task.id,
        workspace_id: workspaceResult.workspace.id,
        run_id: runResult.run.run_id,
        reason_class: 'approval_required',
        evidence_ref: 'evidence://supervisor/contract-1',
      });

      const queue = await harness.callTool('get_execution_queue', {
        project_id: isolatedProjectId,
        limit: 20,
      });
      const nextTask = await harness.callTool('get_next_task', {
        project_id: isolatedProjectId,
        agent_id: 'agent-supervisor-reader-1',
      });

      const queuedTask = queue.queue.find((task) => task.id === taskResult.task.id);
      expect(queuedTask.supervisor).toEqual(
        expect.objectContaining({
          supervisor_state: 'awaiting_approval',
          outcome: 'wait',
          reason_class: 'approval_required',
          evidence_ref: 'evidence://supervisor/contract-1',
          workspace_id: workspaceResult.workspace.id,
          run_id: runResult.run.run_id,
          approval_checkpoint_key: checkpoint.checkpoint.checkpoint_key,
        })
      );
      expect(queuedTask.supervisor.approval_checkpoint).toEqual(
        expect.objectContaining({
          checkpoint_key: checkpoint.checkpoint.checkpoint_key,
          status: 'pending',
          task_id: taskResult.task.id,
          workspace_id: workspaceResult.workspace.id,
          run_id: runResult.run.run_id,
        })
      );
      expect(nextTask.task.id).toBe(taskResult.task.id);
      expect(nextTask.task.supervisor).toEqual(
        expect.objectContaining({
          supervisor_state: 'awaiting_approval',
          outcome: 'wait',
          reason_class: 'approval_required',
          evidence_ref: 'evidence://supervisor/contract-1',
          approval_checkpoint_key: checkpoint.checkpoint.checkpoint_key,
        })
      );
    });
  });
});
