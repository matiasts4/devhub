jest.mock('next/server', () => ({
  NextResponse: {
    json: jest.fn((body, init) => ({ body, status: init?.status || 200 })),
  },
}));

jest.mock('fs', () => ({
  statSync: jest.fn(),
}));

const mockGet = jest.fn();
const mockRun = jest.fn();
jest.mock('@/lib/db/localDb', () => ({
  getDb: jest.fn(() => ({
    prepare: jest.fn(() => ({ get: mockGet, run: mockRun })),
  })),
}));

const fs = require('fs');
const path = require('path');
const { POST } = require('./route');

function setExistingDirs(dirs) {
  const existing = new Set(dirs);
  fs.statSync.mockImplementation((candidate) => {
    if (existing.has(candidate)) return { isDirectory: () => true };
    const err = new Error(`ENOENT: ${candidate}`);
    err.code = 'ENOENT';
    throw err;
  });
}

function makeRequest(body) {
  return { json: async () => body };
}

const SERVER_ROOT = path.resolve('/srv/devhub');

beforeEach(() => {
  jest.clearAllMocks();
  process.env.DEVHUB_PROJECT_DIR = SERVER_ROOT;
});

afterEach(() => {
  delete process.env.DEVHUB_PROJECT_DIR;
});

describe('POST /api/project/repair-local-path', () => {
  test('rejects a missing projectId', async () => {
    const res = await POST(makeRequest({}));
    expect(res.status).toBe(400);
  });

  test('returns 404 when the project does not exist', async () => {
    mockGet.mockReturnValue(undefined);
    const res = await POST(makeRequest({ projectId: 'nope' }));
    expect(res.status).toBe(404);
  });

  test('leaves a usable local_path untouched', async () => {
    mockGet.mockReturnValue({ id: 'p1', local_path: 'D:\\devhub' });
    setExistingDirs(['D:\\devhub']);

    const res = await POST(makeRequest({ projectId: 'p1' }));

    expect(res.body).toEqual({ changed: false, exists: true, localPath: 'D:\\devhub' });
    expect(mockRun).not.toHaveBeenCalled();
  });

  test('repairs a stale cross-platform path to the server root', async () => {
    mockGet.mockReturnValue({ id: 'p1', local_path: '/home/arxonlabs/devhub' });
    setExistingDirs([SERVER_ROOT]);

    const res = await POST(makeRequest({ projectId: 'p1' }));

    expect(res.body).toEqual({
      changed: true,
      exists: false,
      previousPath: '/home/arxonlabs/devhub',
      localPath: SERVER_ROOT,
    });
    expect(mockRun).toHaveBeenCalledWith(SERVER_ROOT, 'p1');
  });

  test('does not repair when the server root is not usable', async () => {
    mockGet.mockReturnValue({ id: 'p1', local_path: '/home/arxonlabs/devhub' });
    setExistingDirs([]);

    const res = await POST(makeRequest({ projectId: 'p1' }));

    expect(res.body).toMatchObject({ changed: false, exists: false, suggestedRoot: SERVER_ROOT });
    expect(mockRun).not.toHaveBeenCalled();
  });
});
