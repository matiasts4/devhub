const mockGetStatus = jest.fn();
const mockGetStatusQueue = jest.fn();
const mockGetSwarmConfig = jest.fn();
const mockGetActiveAgentCount = jest.fn();

jest.mock('@/lib/swarm/processManager', () => ({
  __esModule: true,
  default: {
    getStatus: (...args) => mockGetStatus(...args),
  },
}));

jest.mock('@/lib/swarm/queue', () => ({
  __esModule: true,
  default: {
    getStatus: (...args) => mockGetStatusQueue(...args),
  },
}));

jest.mock('@/lib/db/localDb.js', () => ({
  getSwarmConfig: (...args) => mockGetSwarmConfig(...args),
  getActiveAgentCount: (...args) => mockGetActiveAgentCount(...args),
}));

jest.mock('next/server', () => ({
  NextResponse: {
    json(body, init = {}) {
      return {
        status: init.status ?? 200,
        json: async () => body,
      };
    },
  },
}));

describe('GET /api/agenthub/opencode/status compatibility contract', () => {
  beforeEach(() => {
    jest.resetModules();
    mockGetStatus.mockReset();
    mockGetStatusQueue.mockReset();
    mockGetSwarmConfig.mockReset();
    mockGetActiveAgentCount.mockReset();

    mockGetStatus.mockResolvedValue({
      running: true,
      healthy: true,
      pid: 123,
      port: 4154,
      processInfo: { uptime: 2500, memoryMB: 64 },
    });
    mockGetStatusQueue.mockReturnValue({ length: 2, items: [{ estimatedWaitMs: 1200 }] });
    mockGetSwarmConfig.mockReturnValue({ max_concurrent: '4' });
    mockGetActiveAgentCount.mockReturnValue(2);
  });

  test('adds authority and freshness metadata without breaking legacy process fields', async () => {
    const { GET } = require('../../src/app/api/agenthub/opencode/status/route');

    const response = await GET();
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.process).toMatchObject({
      running: true,
      healthy: true,
      pid: 123,
      port: 4154,
      status: 'healthy',
      authority: 'authoritative',
      freshness: 'current',
    });
    expect(body.process_health).toMatchObject({
      key: 'opencode-process',
      authority: 'authoritative',
      status: 'healthy',
    });
    expect(body.concurrency).toMatchObject({ active: 2, max: 4, atLimit: false });
    expect(body.queue).toMatchObject({ length: 2, estimatedWaitMs: 1200 });
  });

  test('degrades stopped process explicitly instead of omitting health semantics', async () => {
    mockGetStatus.mockResolvedValue({
      running: false,
      healthy: false,
      pid: null,
      port: 4154,
      processInfo: null,
    });

    const { GET } = require('../../src/app/api/agenthub/opencode/status/route');

    const response = await GET();
    const body = await response.json();

    expect(body.process.status).toBe('offline');
    expect(body.process.freshness).toBe('current');
    expect(body.process_health.status_reason).toContain('not running');
  });
});
