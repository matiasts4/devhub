jest.mock('next/server', () => ({
  NextResponse: {
    json: jest.fn((body, init) => ({ body, status: init?.status || 200 })),
  },
}));

const mockCloseSession = jest.fn();
const mockExistsSync = jest.fn(() => false);
const mockReadFileSync = jest.fn();
const mockSpawn = jest.fn();

jest.mock('@/lib/terminal/ttyServer', () => ({
  closeSession: mockCloseSession,
  ensureTTYServer: jest.fn(),
}));

jest.mock('fs', () => ({
  existsSync: (...args) => mockExistsSync(...args),
  readFileSync: (...args) => mockReadFileSync(...args),
}));

jest.mock('child_process', () => ({
  spawn: (...args) => mockSpawn(...args),
}));

const { NextResponse } = require('next/server');
const { ensureTTYServer } = require('@/lib/terminal/ttyServer');

describe('GET /api/terminal/session', () => {
  const originalFetch = global.fetch;
  const originalNodeEnv = process.env.NODE_ENV;

  beforeEach(() => {
    jest.clearAllMocks();
    process.env.NODE_ENV = 'test';
    delete process.env.DEVHUB_SIDECAR_PATH;
    global.fetch = jest.fn();
    mockExistsSync.mockReturnValue(false);
    mockReadFileSync.mockReset();
    mockSpawn.mockReturnValue({ unref: jest.fn() });
    NextResponse.json.mockImplementation((body, init) => ({ body, status: init?.status || 200 }));
    ensureTTYServer.mockResolvedValue({ port: 3001, wsPath: '/terminals' });
  });

  afterAll(() => {
    process.env.NODE_ENV = originalNodeEnv;
    global.fetch = originalFetch;
  });

  test('returns the local tty server contract outside production', async () => {
    const { GET } = require('./route.js');
    const request = {
      nextUrl: new URL('http://localhost/api/terminal/session?cwd=%2Fworkspace%2Fdevhub'),
    };

    const response = await GET(request);

    expect(ensureTTYServer).toHaveBeenCalledWith('/workspace/devhub');
    expect(response.body).toEqual({ port: 3001, wsPath: '/terminals' });
  });

  test('returns the json tty path for the production sidecar transport', async () => {
    process.env.NODE_ENV = 'production';
    mockExistsSync.mockReturnValue(true);
    mockReadFileSync.mockReturnValue('4000');
    global.fetch.mockResolvedValueOnce({ ok: true });

    const { GET } = require('./route.js');
    const request = {
      nextUrl: new URL('http://localhost/api/terminal/session?cwd=%2Fworkspace%2Fdevhub'),
    };

    const response = await GET(request);

    expect(global.fetch).toHaveBeenCalledWith('http://127.0.0.1:4000/health', {
      cache: 'no-store',
    });
    expect(response.body).toEqual({ port: 4000, wsPath: '/tty' });
    expect(ensureTTYServer).not.toHaveBeenCalled();
  });

  test('respawns the packaged sidecar when production health fails and standalone fallback is unavailable', async () => {
    process.env.NODE_ENV = 'production';
    ensureTTYServer.mockRejectedValue(new Error("Cannot find module 'node-pty'"));
    mockExistsSync.mockImplementation((targetPath) => {
      if (String(targetPath).endsWith('sidecar-port.txt')) return true;
      if (String(targetPath).includes('sidecar-backend/server.js')) return true;
      return false;
    });
    mockReadFileSync.mockReturnValue('4000');
    global.fetch
      .mockRejectedValueOnce(new Error('ECONNREFUSED'))
      .mockResolvedValueOnce({ ok: true });

    const { GET } = require('./route.js');
    const request = {
      nextUrl: new URL('http://localhost/api/terminal/session?cwd=%2Fworkspace%2Fdevhub'),
    };

    const response = await GET(request);

    expect(ensureTTYServer).toHaveBeenCalledWith('/workspace/devhub');
    expect(mockSpawn).toHaveBeenCalledWith(
      process.execPath,
      [expect.stringContaining('sidecar-backend/server.js')],
      expect.objectContaining({
        cwd: expect.stringContaining('sidecar-backend'),
        detached: true,
        stdio: 'ignore',
        env: expect.objectContaining({
          NODE_ENV: 'production',
          SIDECAR_PORT: '4000',
        }),
      })
    );
    expect(response.body).toEqual({ port: 4000, wsPath: '/tty' });
    expect(response.status).toBe(200);
  });

  test('keeps the production 503 when no sidecar recovery path exists', async () => {
    process.env.NODE_ENV = 'production';
    ensureTTYServer.mockRejectedValue(new Error("Cannot find module 'node-pty'"));
    mockExistsSync.mockImplementation((targetPath) => String(targetPath).endsWith('sidecar-port.txt'));
    mockReadFileSync.mockReturnValue('4000');
    global.fetch.mockRejectedValue(new Error('ECONNREFUSED'));

    const { GET } = require('./route.js');
    const request = {
      nextUrl: new URL('http://localhost/api/terminal/session?cwd=%2Fworkspace%2Fdevhub'),
    };

    const response = await GET(request);

    expect(mockSpawn).not.toHaveBeenCalled();
    expect(response.status).toBe(503);
    expect(response.body).toEqual({ error: 'Servidor terminal (sidecar) no encontrado' });
  });
});

describe('DELETE /api/terminal/session', () => {
  const originalFetch = global.fetch;
  const originalNodeEnv = process.env.NODE_ENV;

  beforeEach(() => {
    jest.clearAllMocks();
    process.env.NODE_ENV = 'test';
    global.fetch = jest.fn();
    mockExistsSync.mockReturnValue(false);
    mockReadFileSync.mockReset();
    NextResponse.json.mockImplementation((body, init) => ({ body, status: init?.status || 200 }));
  });

  afterAll(() => {
    process.env.NODE_ENV = originalNodeEnv;
    global.fetch = originalFetch;
  });

  test('closes the requested PTY session by id in development', async () => {
    const { DELETE } = require('./route.js');
    const request = {
      nextUrl: new URL('http://localhost/api/terminal/session?sessionId=p3'),
    };

    const response = await DELETE(request);

    expect(mockCloseSession).toHaveBeenCalledWith('p3');
    expect(NextResponse.json).toHaveBeenLastCalledWith({ success: true, sessionId: 'p3' });
    expect(response.status).toBe(200);
  });

  test('forwards explicit close requests to the production sidecar', async () => {
    process.env.NODE_ENV = 'production';
    mockExistsSync.mockReturnValue(true);
    mockReadFileSync.mockReturnValue('4000');
    global.fetch
      .mockResolvedValueOnce({ ok: true })
      .mockResolvedValueOnce({ ok: true, status: 200 });

    const { DELETE } = require('./route.js');
    const request = {
      nextUrl: new URL('http://localhost/api/terminal/session?sessionId=p3'),
    };

    const response = await DELETE(request);

    expect(global.fetch).toHaveBeenNthCalledWith(1, 'http://127.0.0.1:4000/health', {
      cache: 'no-store',
    });
    expect(global.fetch).toHaveBeenNthCalledWith(2, 'http://127.0.0.1:4000/sessions/p3', {
      method: 'DELETE',
      cache: 'no-store',
    });
    expect(mockCloseSession).not.toHaveBeenCalled();
    expect(response.status).toBe(200);
  });

  test('returns 400 when sessionId is missing', async () => {
    const { DELETE } = require('./route.js');
    const request = {
      nextUrl: new URL('http://localhost/api/terminal/session'),
    };

    const response = await DELETE(request);

    expect(mockCloseSession).not.toHaveBeenCalled();
    expect(NextResponse.json).toHaveBeenLastCalledWith({ error: 'sessionId required' }, { status: 400 });
    expect(response.status).toBe(400);
  });
});
