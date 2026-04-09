/**
 * Integration tests for MCP Milestone and Dashboard tools:
 *   - list_milestones
 *   - create_milestone
 *   - update_milestone
 *   - get_dashboard
 */

import { describe, it, expect, beforeAll, afterAll } from '@jest/globals';
import { createTestHarness } from '../test-harness.js';

describe('MCP Milestone & Dashboard Tools', () => {
  let harness;
  let projectId;
  let userId;
  let createdMilestoneId;

  beforeAll(async () => {
    harness = await createTestHarness();
    await harness.initialize();

    const projects = await harness.callTool('list_projects', { status: 'all' });
    if (projects.projects.length > 0) {
      projectId = projects.projects[0].id;
    }
    userId = '54fee7d7-340d-4683-b259-b61a39567f94';
  });

  afterAll(async () => {
    await harness.cleanup();
  });

  describe('list_milestones', () => {
    it('returns milestones for a project', async () => {
      if (!projectId) {
        console.log('SKIP: no projects in DB');
        return;
      }
      const result = await harness.callTool('list_milestones', {
        project_id: projectId,
        status: 'all',
      });
      expect(result).toHaveProperty('milestones');
      expect(Array.isArray(result.milestones)).toBe(true);
    });

    it('filters by status', async () => {
      if (!projectId) return;
      const result = await harness.callTool('list_milestones', {
        project_id: projectId,
        status: 'completed',
      });
      expect(result.milestones.every((m) => m.status === 'completed')).toBe(true);
    });
  });

  describe('create_milestone', () => {
    it('creates a milestone with required fields', async () => {
      if (!projectId) {
        console.log('SKIP: no projects in DB');
        return;
      }
      const result = await harness.callTool('create_milestone', {
        project_id: projectId,
        user_id: userId,
        title: 'Test Milestone - Integration',
      });
      expect(result.created).toBe(true);
      expect(result.milestone).toHaveProperty('id');
      expect(result.milestone.title).toBe('Test Milestone - Integration');
      expect(result.milestone.status).toBe('planned');
      createdMilestoneId = result.milestone.id;
    });

    it('creates a milestone with all fields', async () => {
      if (!projectId) return;
      const result = await harness.callTool('create_milestone', {
        project_id: projectId,
        user_id: userId,
        title: 'Full Milestone',
        description: 'A milestone with everything',
        status: 'in_progress',
        due_date: '2026-12-31',
      });
      expect(result.created).toBe(true);
      expect(result.milestone.status).toBe('in_progress');
      expect(result.milestone.due_date).toBe('2026-12-31');
    });

    it('errors on missing title', async () => {
      if (!projectId) return;
      const result = await harness.callTool('create_milestone', {
        project_id: projectId,
        user_id: userId,
      });
      const text = result.raw || JSON.stringify(result);
      expect(text).toMatch(/ERROR|error|required|invalid/i);
    });
  });

  describe('update_milestone', () => {
    it('updates milestone status', async () => {
      if (!createdMilestoneId) {
        console.log('SKIP: no milestone created');
        return;
      }
      const result = await harness.callTool('update_milestone', {
        milestone_id: createdMilestoneId,
        status: 'completed',
      });
      expect(result.updated).toBe(true);
      expect(result.milestone.status).toBe('completed');
    });

    it('updates milestone title and description', async () => {
      if (!createdMilestoneId) return;
      const result = await harness.callTool('update_milestone', {
        milestone_id: createdMilestoneId,
        title: 'Updated Milestone',
        description: 'Updated description',
      });
      expect(result.updated).toBe(true);
      expect(result.milestone.title).toBe('Updated Milestone');
    });
  });

  describe('get_dashboard', () => {
    it('returns global dashboard with all projects', async () => {
      const result = await harness.callTool('get_dashboard');
      expect(result).toHaveProperty('total_projects');
      expect(result).toHaveProperty('active_projects');
      expect(result).toHaveProperty('dashboard');
      expect(Array.isArray(result.dashboard)).toBe(true);
      if (result.dashboard.length > 0) {
        const proj = result.dashboard[0];
        expect(proj).toHaveProperty('tasks');
        expect(proj.tasks).toHaveProperty('total');
        expect(proj.tasks).toHaveProperty('completed');
        expect(proj.tasks).toHaveProperty('overdue');
      }
    });
  });
});
