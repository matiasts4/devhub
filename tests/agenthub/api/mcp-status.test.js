/**
 * Test GET /api/agenthub/mcp/status
 *
 * Tests the MCP server status endpoint.
 */

const { ApiTestHarness, getAgentHubBaseUrl } = require('./harness');

const BASE_URL = getAgentHubBaseUrl();

describe('GET /api/agenthub/mcp/status', () => {
  let harness;

  beforeEach(() => {
    harness = new ApiTestHarness({
      baseUrl: BASE_URL,
      dbPath: ':memory:',
      lockOwner: 'test-mcp-status',
    });
    harness.setupDb();
  });

  afterEach(() => {
    harness.teardownDb();
  });

  test('returns MCP server status with servers array', async () => {
    if (await harness.skipIfServerUnavailable()) {
      return;
    }

    const { response, body } = await harness.requestJson('GET', '/api/agenthub/mcp/status');

    harness.assertStatus(response, 200);
    harness.assertBodyShape(body, {
      servers: 'object', // Can be array or object depending on response
    });

    expect(Array.isArray(body.servers)).toBe(true);
    expect(body.servers.length).toBeGreaterThan(0);

    // Each server should have name, status, and tools
    body.servers.forEach((server) => {
      expect(server).toHaveProperty('name');
      expect(server).toHaveProperty('status');
      expect(server).toHaveProperty('tools');
      expect(Array.isArray(server.tools)).toBe(true);

      server.tools.forEach((tool) => {
        expect(tool).toHaveProperty('name');
        expect(tool).toHaveProperty('description');
      });
    });
  });

  test('known MCP servers include filesystem and web', async () => {
    if (await harness.skipIfServerUnavailable()) {
      return;
    }

    const { response, body } = await harness.requestJson('GET', '/api/agenthub/mcp/status');

    if (response.status === 200) {
      const serverNames = body.servers.map((s) => s.name);
      // At minimum, filesystem and web servers should be configured
      expect(serverNames).toContain('filesystem');
      expect(serverNames).toContain('web');
    }
  });

  test('filesystem server has expected tools', async () => {
    if (await harness.skipIfServerUnavailable()) {
      return;
    }

    const { response, body } = await harness.requestJson('GET', '/api/agenthub/mcp/status');

    if (response.status === 200) {
      const fsServer = body.servers.find((s) => s.name === 'filesystem');
      if (fsServer) {
        const toolNames = fsServer.tools.map((t) => t.name);
        expect(toolNames).toContain('read_file');
        expect(toolNames).toContain('write_file');
        expect(toolNames).toContain('list_directory');
      }
    }
  });
});
