jest.mock('next/server', () => ({
  NextResponse: {
    json: jest.fn((body, init) => ({ body, status: init?.status || 200 })),
  },
}));

const mockSpawn = jest.fn();
const mockGetProfileHome = jest.fn((profileName) => `/tmp/${profileName}`);
const mockInsert = jest.fn();
const mockIsDocOpsPlanningPrompt = jest.fn(() => false);
const mockEnforceDocOpsGateOnText = jest.fn((text) => text);

jest.mock('child_process', () => ({
  spawn: (...args) => mockSpawn(...args),
}));

jest.mock('@/utils/geminiProfiles', () => ({
  getProfileHome: (...args) => mockGetProfileHome(...args),
}));

jest.mock('@/lib/db/localDb', () => ({
  getDb: jest.fn(() => ({
    tables: {
      agent_registry: {
        insert: (...args) => mockInsert(...args),
      },
    },
  })),
}));

jest.mock('@/lib/docopsPrompts', () => ({
  enforceDocOpsGateOnText: (...args) => mockEnforceDocOpsGateOnText(...args),
  isDocOpsPlanningPrompt: (...args) => mockIsDocOpsPlanningPrompt(...args),
}));

const { NextResponse } = require('next/server');
const { POST } = require('./route.js');

describe('POST /api/agents/launch legacy quota removal', () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    jest.clearAllMocks();
    global.fetch = jest.fn();
    mockSpawn.mockReturnValue({ unref: jest.fn() });
    NextResponse.json.mockImplementation((body, init) => ({ body, status: init?.status || 200 }));
  });

  afterAll(() => {
    global.fetch = originalFetch;
  });

  test.each([
    ['missing profileName', { task: 'Say hello' }],
    ['auto profileName', { task: 'Say hello', profileName: 'auto' }],
  ])(
    'falls back to default profile for %s without hitting legacy quotas',
    async (_label, payload) => {
      const response = await POST({
        url: 'http://localhost:3100/api/agents/launch',
        json: async () => payload,
      });

      expect(global.fetch).not.toHaveBeenCalled();
      expect(mockGetProfileHome).toHaveBeenCalledWith('default');
      expect(mockSpawn).toHaveBeenCalledWith(
        'opencode',
        ['--task', 'Say hello'],
        expect.objectContaining({
          detached: true,
          stdio: 'ignore',
          env: expect.objectContaining({
            GEMINI_CLI_HOME: '/tmp/default',
          }),
        })
      );
      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.message).toContain('profile default');
    }
  );
});
