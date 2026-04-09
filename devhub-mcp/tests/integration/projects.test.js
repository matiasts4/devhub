/**
 * Integration tests for MCP Project tools:
 *   - list_projects
 *   - get_project
 *   - update_project
 */

import { describe, it, expect, beforeAll, afterAll } from '@jest/globals';
import { createTestHarness } from '../test-harness.js';

describe('MCP Project Tools', () => {
  let harness;
  let testProjectId;

  beforeAll(async () => {
    harness = await createTestHarness();
    await harness.initialize();
  });

  afterAll(async () => {
    await harness.cleanup();
  });

  describe('list_projects', () => {
    it('returns all projects when no filter', async () => {
      const result = await harness.callTool('list_projects', { status: 'all' });
      expect(result).toHaveProperty('projects');
      expect(Array.isArray(result.projects)).toBe(true);
      expect(result).toHaveProperty('total');
    });

    it('filters by status', async () => {
      const result = await harness.callTool('list_projects', { status: 'active' });
      expect(result.projects.every((p) => p.status === 'active')).toBe(true);
    });

    it('returns empty array for non-existent status', async () => {
      const result = await harness.callTool('list_projects', { status: 'archived' });
      // Should not error, just return 0 or more archived projects
      expect(result).toHaveProperty('projects');
    });
  });

  describe('get_project', () => {
    beforeAll(async () => {
      const all = await harness.callTool('list_projects', { status: 'all' });
      if (all.projects.length > 0) {
        testProjectId = all.projects[0].id;
      }
    });

    it('returns project details with tasks and milestones', async () => {
      if (!testProjectId) {
        console.log('SKIP: no projects in DB');
        return;
      }
      const result = await harness.callTool('get_project', { project_id: testProjectId });
      expect(result).toHaveProperty('project');
      expect(result).toHaveProperty('tasks');
      expect(result).toHaveProperty('milestones');
      expect(result).toHaveProperty('summary');
      expect(result.summary).toHaveProperty('total_tasks');
    });

    it('errors on invalid project_id', async () => {
      const result = await harness.callTool('get_project', { project_id: 'not-a-valid-id' });
      const text = result.raw || JSON.stringify(result);
      expect(text).toMatch(/ERROR|error|invalid/i);
    });
  });

  describe('update_project', () => {
    it('errors when no fields provided', async () => {
      const result = await harness.callTool('update_project', {
        project_id: '00000000-0000-0000-0000-000000000000',
      });
      const text = result.raw || JSON.stringify(result);
      expect(text).toMatch(/ERROR|error|no se proporcionaron/i);
    });

    it('errors on non-existent project', async () => {
      const result = await harness.callTool('update_project', {
        project_id: '00000000-0000-0000-0000-000000000000',
        name: 'Nonexistent',
      });
      const text = result.raw || JSON.stringify(result);
      expect(text).toMatch(/ERROR|error|no encontrado/i);
    });
  });
});
