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
    const home = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'devhub-sidecar-home-')), '.devhub-dev');
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
    const home = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'devhub-sidecar-home-')), '.devhub');
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
});
