const fs = require('fs');
const os = require('os');
const path = require('path');

const {
  getSidecarPortFilePath,
  probeSidecarPorts,
  readProductionSidecarPort,
  readSidecarPortForTerminalSession,
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

  test('readSidecarPortForTerminalSession never uses production port in dev runtime', async () => {
    process.env.DEVHUB_RUNTIME = 'development';
    process.env.DEVHUB_HOME = path.join(
      fs.mkdtempSync(path.join(os.tmpdir(), 'devhub-sidecar-dev-only-')),
      '.devhub-dev'
    );
    fs.mkdirSync(process.env.DEVHUB_HOME, { recursive: true });

    global.fetch.mockResolvedValue({ ok: false, text: async () => '' });

    // Fail-fast options (same as GET /api/terminal/session) — one probe only.
    await expect(
      readSidecarPortForTerminalSession({ timeoutMs: 120, attempts: 1, gapMs: 0 })
    ).resolves.toBeNull();
    expect(global.fetch).toHaveBeenCalledTimes(1);
    expect(global.fetch).toHaveBeenCalledWith(
      'http://127.0.0.1:4001/health',
      expect.objectContaining({ cache: 'no-store' })
    );
    // Never probed the production sidecar in dev.
    expect(global.fetch.mock.calls.every(([url]) => String(url).includes(':4001'))).toBe(true);

    delete process.env.DEVHUB_RUNTIME;
    delete process.env.DEVHUB_HOME;
  });

  test('probeSidecarPorts falls back to the next default port', async () => {
    global.fetch
      .mockResolvedValueOnce({ ok: false, text: async () => '' })
      .mockResolvedValueOnce({ ok: true, text: async () => '{"status":"ok"}' });

    await expect(probeSidecarPorts([4000, 4001])).resolves.toBe(4001);
  });
});
