/**
 * Integration tests for MCP planning/context tools.
 *   - get_project_context
 */

import { describe, it, expect, beforeAll, afterAll } from '@jest/globals';
import { createTestHarness } from '../test-harness.js';

describe('MCP Planning Tools', () => {
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
});
