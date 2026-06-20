/**
 * @jest-environment node
 */

jest.mock('../utils/callDevHubMcp', () => ({
  callDevHubMcp: jest.fn(),
}));

const {
  listProjectsTool,
  getProjectTool,
  getProjectContextTool,
  listTasksTool,
  getExecutionQueueTool,
  createTaskTool,
  createMilestoneTool,
} = require('../tools/devhubMcp');
const { callDevHubMcp } = require('../utils/callDevHubMcp');

describe('devhubMcp tools', () => {
  beforeEach(() => {
    callDevHubMcp.mockReset();
  });

  test('list_projects calls MCP', async () => {
    callDevHubMcp.mockResolvedValue({ projects: [] });
    const result = await listProjectsTool.execute({});
    expect(callDevHubMcp).toHaveBeenCalledWith('list_projects', {});
    expect(result).toEqual({ projects: [] });
  });

  test('get_project uses default project id', async () => {
    callDevHubMcp.mockResolvedValue({ id: 'p1' });
    await getProjectTool.execute({}, {});
    expect(callDevHubMcp).toHaveBeenCalledWith('get_project', {
      project_id: 'ccafadde-6ff3-480a-83dd-960cd3ed8f1c',
    });
  });

  test('get_project_context passes project_id', async () => {
    callDevHubMcp.mockResolvedValue({ milestones: [] });
    await getProjectContextTool.execute({}, { project_id: 'custom-id' });
    expect(callDevHubMcp).toHaveBeenCalledWith('get_project_context', { project_id: 'custom-id' });
  });

  test('list_tasks passes filters', async () => {
    callDevHubMcp.mockResolvedValue({ tasks: [] });
    await listTasksTool.execute({ milestone_id: 'm1', status: 'pending' });
    expect(callDevHubMcp).toHaveBeenCalledWith('list_tasks', {
      project_id: 'ccafadde-6ff3-480a-83dd-960cd3ed8f1c',
      milestone_id: 'm1',
      status: 'pending',
    });
  });

  test('get_execution_queue uses default project', async () => {
    callDevHubMcp.mockResolvedValue({ queue: [] });
    await getExecutionQueueTool.execute({});
    expect(callDevHubMcp).toHaveBeenCalledWith('get_execution_queue', {
      project_id: 'ccafadde-6ff3-480a-83dd-960cd3ed8f1c',
    });
  });

  test('create_task builds correct payload', async () => {
    callDevHubMcp.mockResolvedValue({ task: { id: 't1' } });
    await createTaskTool.execute({ title: 'Test task', priority: 'high' });
    expect(callDevHubMcp).toHaveBeenCalledWith('create_task', {
      project_id: 'ccafadde-6ff3-480a-83dd-960cd3ed8f1c',
      user_id: 'd9436f02-67b5-4610-904f-e13d81e1b7e5',
      title: 'Test task',
      description: '',
      priority: 'high',
    });
  });

  test('create_milestone builds correct payload', async () => {
    callDevHubMcp.mockResolvedValue({ milestone: { id: 'm1' } });
    await createMilestoneTool.execute({ title: 'v2', due_date: '2026-12-31' });
    expect(callDevHubMcp).toHaveBeenCalledWith('create_milestone', {
      project_id: 'ccafadde-6ff3-480a-83dd-960cd3ed8f1c',
      user_id: 'd9436f02-67b5-4610-904f-e13d81e1b7e5',
      title: 'v2',
      description: '',
      status: 'planned',
      due_date: '2026-12-31',
    });
  });
});
