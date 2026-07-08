/**
 * @jest-environment node
 */

const fs = require('fs');
const os = require('os');
const path = require('path');

describe('crashLog', () => {
  let tmp;
  let prevCwd;

  beforeEach(() => {
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'devhub-crash-'));
    prevCwd = process.cwd();
    process.chdir(tmp);
    jest.resetModules();
  });

  afterEach(() => {
    process.chdir(prevCwd);
    fs.rmSync(tmp, { recursive: true, force: true });
  });

  test('classifies ResizeObserver as noise', () => {
    const { classifyClientLogSeverity, isNoiseError } = require('../crashLog');
    expect(isNoiseError('ResizeObserver loop completed with undelivered notifications.')).toBe(
      true
    );
    expect(
      classifyClientLogSeverity({
        level: 'error',
        message: 'ResizeObserver loop completed with undelivered notifications.',
        source: 'window.onerror',
      })
    ).toBe('noise');
  });

  test('classifies xterm dimensions TypeError as noise (not crash dump flood)', () => {
    const { classifyClientLogSeverity, isNoiseError } = require('../crashLog');
    const msg = "Cannot read properties of undefined (reading 'dimensions')";
    expect(isNoiseError(msg)).toBe(true);
    expect(
      classifyClientLogSeverity({
        level: 'error',
        message: msg,
        source: 'window.onerror',
      })
    ).toBe('noise');
  });

  test('writes crash dump for ReferenceError from window.onerror', async () => {
    const { writeClientLogEntry } = require('../crashLog');
    const result = await writeClientLogEntry({
      level: 'error',
      message: 'Uncaught ReferenceError: browserChromeActive is not defined',
      source: 'window.onerror',
      details: { stack: 'ReferenceError: browserChromeActive is not defined' },
      ts: Date.now(),
    });
    expect(result.severity).toBe('crash');
    expect(result.dumpPath).toBeTruthy();
    expect(fs.existsSync(path.join(tmp, 'data', 'logs', 'browser.log'))).toBe(true);
    expect(fs.existsSync(path.join(tmp, 'data', 'logs', 'crash.log'))).toBe(true);
    expect(fs.existsSync(result.dumpPath)).toBe(true);
    const dump = JSON.parse(fs.readFileSync(result.dumpPath, 'utf8'));
    expect(dump.message).toMatch(/browserChromeActive/);
  });

  test('react-error-boundary is crash severity', async () => {
    const { writeClientLogEntry } = require('../crashLog');
    const result = await writeClientLogEntry({
      level: 'error',
      message: 'Cannot access layoutOverlayOptions before initialization',
      source: 'react-error-boundary',
    });
    expect(result.severity).toBe('crash');
    expect(result.dumpPath).toBeTruthy();
  });
});
