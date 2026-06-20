import { callDevHubMcp } from '../utils/callDevHubMcp';

describe('callDevHubMcp', () => {
  test('calls a DevHub MCP tool successfully', async () => {
    const result = await callDevHubMcp('list_projects', { status: 'all' });
    expect(result).toHaveProperty('total');
    expect(result).toHaveProperty('projects');
    expect(Array.isArray(result.projects)).toBe(true);
  }, 15000);

  test('returns error for unknown tool', async () => {
    await expect(callDevHubMcp('non_existent_tool', {})).rejects.toThrow(
      'MCP error -32602: Tool non_existent_tool not found'
    );
  }, 15000);
});
