/**
 * Integration tests for MCP Task tools:
 *   - list_tasks
 *   - create_task
 *   - update_task
 *   - delete_task
 *   - add_task_comment
 *   - create_task_dependency
 *   - get_task_dependencies
 *   - get_next_task
 */

import { describe, it, expect, beforeAll, afterAll } from '@jest/globals';
import { createTestHarness } from '../test-harness.js';

describe('MCP Task Tools', () => {
  let harness;
  let projectId;
  let userId;
  let createdTaskId;
  let milestoneId;

  beforeAll(async () => {
    harness = await createTestHarness();
    await harness.initialize();

    // Get a real project to work with
    const projects = await harness.callTool('list_projects', { status: 'all' });
    if (projects.projects.length > 0) {
      projectId = projects.projects[0].id;
    }
    userId = '54fee7d7-340d-4683-b259-b61a39567f94'; // Standard test user
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

  describe('update_task', () => {
    it('updates task status', async () => {
      if (!createdTaskId) {
        console.log('SKIP: no task created');
        return;
      }
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

  describe('create_task_dependency / get_task_dependencies', () => {
    let taskA, taskB;

    beforeAll(async () => {
      if (!projectId) return;
      const a = await harness.callTool('create_task', {
        project_id: projectId,
        user_id: userId,
        title: 'Task A (dependency)',
      });
      const b = await harness.callTool('create_task', {
        project_id: projectId,
        user_id: userId,
        title: 'Task B (depends on A)',
      });
      taskA = a.task.id;
      taskB = b.task.id;
    });

    it('creates a dependency between tasks', async () => {
      if (!taskA || !taskB) return;
      const result = await harness.callTool('create_task_dependency', {
        task_id: taskB,
        depends_on: taskA,
        tipo: 'blocks',
      });
      expect(result.created).toBe(true);
      expect(result.dependency.task_id).toBe(taskB);
      expect(result.dependency.depends_on).toBe(taskA);
    });

    it('returns dependencies for a task', async () => {
      if (!taskA || !taskB) return;
      const result = await harness.callTool('get_task_dependencies', { task_id: taskB });
      expect(result).toHaveProperty('blocking');
      expect(result).toHaveProperty('blocked_by');
      expect(result.blocking.some((d) => d.depends_on === taskA)).toBe(true);
    });
  });

  describe('get_next_task', () => {
    it('returns next prioritized task or null message', async () => {
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
      }
    });
  });

  describe('delete_task', () => {
    it('deletes a task', async () => {
      if (!createdTaskId) return;
      const result = await harness.callTool('delete_task', { task_id: createdTaskId });
      expect(result.deleted).toBe(true);
      expect(result.task_id).toBe(createdTaskId);
    });
  });
});
