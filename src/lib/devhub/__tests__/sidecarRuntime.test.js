const fs = require('fs');
const os = require('os');
const path = require('path');

const {
  getSidecarPortFilePath,
  probeSidecarPorts,
  readProductionSidecarPort,
} = require('../sidecarRuntime');

describe('sidecarRuntime', () => {
  const originalFetch = global.fetch;
  const originalDevhubHome = process.env.DEVHUB_HOME;

  beforeEach(() => {
    jest.clearAllMocks();
    delete process.env.DEVHUB_HOME;
    global.fetch = jest.fn();
  });

  afterAll(() => {
    global.fetch = originalFetch;
    if (originalDevhubHome === undefined) {
      delete process.env.DEVHUB_HOME;
    } else {
      process.env.DEVHUB_HOME = originalDevhubHome;
    }
  });

  test('getSidecarPortFilePath prefers DEVHUB_HOME when set', () => {
    const home = path.join(os.tmpdir(), 'devhub-sidecar-runtime-test');
    process.env.DEVHUB_HOME = home;

    expect(getSidecarPortFilePath()).toBe(path.join(home, 'sidecar-port.txt'));
  });

  test('readProductionSidecarPort trusts dev port marker only in dev home', async () => {
    const home = path.join(
      fs.mkdtempSync(path.join(os.tmpdir(), 'devhub-sidecar-home-')),
      '.devhub-dev'
    );
    fs.mkdirSync(home, { recursive: true });
    process.env.DEVHUB_HOME = home;
    fs.writeFileSync(path.join(home, 'sidecar-port.txt'), '4001', 'utf8');
    global.fetch.mockResolvedValueOnce({ ok: true, text: async () => '{"status":"ok"}' });

    await expect(readProductionSidecarPort()).resolves.toBe(4001);
    expect(global.fetch).toHaveBeenCalledWith(
      'http://127.0.0.1:4001/health',
      expect.objectContaining({ cache: 'no-store' })
    );
  });

  test('readProductionSidecarPort ignores polluted dev port marker in production home', async () => {
    const home = path.join(
      fs.mkdtempSync(path.join(os.tmpdir(), 'devhub-sidecar-home-')),
      '.devhub'
    );
    fs.mkdirSync(home, { recursive: true });
    process.env.DEVHUB_HOME = home;
    fs.writeFileSync(path.join(home, 'sidecar-port.txt'), '4001', 'utf8');
    global.fetch.mockResolvedValueOnce({ ok: true, text: async () => '{"status":"ok"}' });

    await expect(readProductionSidecarPort()).resolves.toBe(4000);
    expect(global.fetch).toHaveBeenCalledWith(
      'http://127.0.0.1:4000/health',
      expect.objectContaining({ cache: 'no-store' })
    );
  });

  test('probeSidecarPorts falls back to the next default port', async () => {
    global.fetch
      .mockResolvedValueOnce({ ok: false, text: async () => '' })
      .mockResolvedValueOnce({ ok: true, text: async () => '{"status":"ok"}' });

    await expect(probeSidecarPorts([4000, 4001])).resolves.toBe(4001);
  });

  test('probeSidecarPorts prefers the highest-preference healthy port', async () => {
    const fetchImpl = jest.fn(async () => ({ ok: true, text: async () => '{"status":"ok"}' }));

    await expect(probeSidecarPorts([4000, 4001], { fetchImpl })).resolves.toBe(4000);
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  test('probeSidecarPorts short-circuits without waiting for a hung lower-preference port', async () => {
    let resolveSlow;
    const slowProbe = new Promise((resolve) => {
      resolveSlow = resolve;
    });
    const fetchImpl = jest.fn((url) => {
      if (url.includes(':4000')) {
        return Promise.resolve({ ok: true, text: async () => '{"status":"ok"}' });
      }
      return slowProbe.then(() => ({ ok: true, text: async () => '{"status":"ok"}' }));
    });

    const startedAt = Date.now();
    const result = await probeSidecarPorts([4000, 4001], { fetchImpl, timeoutMs: 30000 });

    expect(result).toBe(4000);
    // Both probes launch in parallel, but the hung port must not delay the answer.
    expect(fetchImpl).toHaveBeenCalledTimes(2);
    expect(Date.now() - startedAt).toBeLessThan(1000);

    resolveSlow(); // settle the dangling probe so the test leaves no pending work
  });

  test('probeSidecarPorts returns null when no port is healthy', async () => {
    const fetchImpl = jest.fn(async () => ({ ok: false, text: async () => '' }));

    await expect(probeSidecarPorts([4000, 4001], { fetchImpl })).resolves.toBeNull();
  });

  test('probeSidecarPorts leaves no unhandled rejection when returning before a slow probe settles', async () => {
    let rejectSlow;
    const slowProbe = new Promise((_, reject) => {
      rejectSlow = reject;
    });
    const fetchImpl = jest.fn((url) => {
      if (url.includes(':4000')) {
        return Promise.resolve({ ok: true, text: async () => '{"status":"ok"}' });
      }
      return slowProbe;
    });
    const onUnhandled = jest.fn();
    process.on('unhandledRejection', onUnhandled);

    try {
      await expect(probeSidecarPorts([4000, 4001], { fetchImpl, timeoutMs: 30000 })).resolves.toBe(
        4000
      );

      rejectSlow(new Error('late probe failure'));
      await new Promise((resolve) => setImmediate(resolve));
      await new Promise((resolve) => setImmediate(resolve));

      expect(onUnhandled).not.toHaveBeenCalled();
    } finally {
      process.removeListener('unhandledRejection', onUnhandled);
    }
  });
});
