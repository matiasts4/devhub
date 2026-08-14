const fs = require('fs');
const os = require('os');
const path = require('path');

const {
  BACKUP_FILE_NAME,
  LOG_FILE_NAME,
  MAX_LOG_BYTES,
  logSidecarEvent,
  resolveSidecarLogFile,
} = require('../../sidecar-backend/sidecarLog.cjs');

describe('sidecarLog', () => {
  let tmpHome;
  let savedDevhubHome;

  beforeEach(() => {
    tmpHome = fs.mkdtempSync(path.join(os.tmpdir(), 'devhub-sidecarlog-test-'));
    savedDevhubHome = process.env.DEVHUB_HOME;
    process.env.DEVHUB_HOME = tmpHome;
  });

  afterEach(() => {
    if (savedDevhubHome === undefined) {
      delete process.env.DEVHUB_HOME;
    } else {
      process.env.DEVHUB_HOME = savedDevhubHome;
    }
    try {
      fs.rmSync(tmpHome, { recursive: true, force: true });
    } catch {
      // best-effort cleanup
    }
  });

  function readLogLines(file) {
    return fs
      .readFileSync(file, 'utf8')
      .split('\n')
      .filter((line) => line.trim())
      .map((line) => JSON.parse(line));
  }

  test('resolves the log path under DEVHUB_HOME when set', () => {
    expect(resolveSidecarLogFile()).toBe(path.join(tmpHome, 'logs', LOG_FILE_NAME));
  });

  test('falls back to ~/.devhub/logs when DEVHUB_HOME is unset', () => {
    delete process.env.DEVHUB_HOME;
    expect(resolveSidecarLogFile()).toBe(
      path.join(os.homedir(), '.devhub', 'logs', LOG_FILE_NAME)
    );
  });

  test('appends one JSONL line with ts/source/event/details', () => {
    logSidecarEvent('pty-session-created', { sessionId: 'term-1', cwd: '/tmp/x' });
    logSidecarEvent('sidecar-startup', { port: 4000 });

    const file = resolveSidecarLogFile();
    expect(fs.existsSync(file)).toBe(true);

    const lines = readLogLines(file);
    expect(lines).toHaveLength(2);
    expect(lines[0].source).toBe('sidecar');
    expect(lines[0].event).toBe('pty-session-created');
    expect(lines[0].sessionId).toBe('term-1');
    expect(lines[0].cwd).toBe('/tmp/x');
    expect(typeof lines[0].ts).toBe('string');
    expect(lines[1].event).toBe('sidecar-startup');
    expect(lines[1].port).toBe(4000);
  });

  test('rotates at ~2MB keeping a single .1 backup', () => {
    const file = resolveSidecarLogFile();
    fs.mkdirSync(path.dirname(file), { recursive: true });
    // Pre-fill at the rotation threshold.
    fs.writeFileSync(file, 'x'.repeat(MAX_LOG_BYTES));

    logSidecarEvent('after-rotation', { n: 1 });

    const backup = path.join(path.dirname(file), BACKUP_FILE_NAME);
    expect(fs.existsSync(backup)).toBe(true);
    expect(fs.statSync(backup).size).toBe(MAX_LOG_BYTES);

    const lines = readLogLines(file);
    expect(lines).toHaveLength(1);
    expect(lines[0].event).toBe('after-rotation');

    // Second rotation overwrites the previous backup without crashing.
    fs.writeFileSync(file, 'y'.repeat(MAX_LOG_BYTES));
    logSidecarEvent('second-rotation', {});
    expect(fs.existsSync(backup)).toBe(true);
    expect(readLogLines(file)[0].event).toBe('second-rotation');
  });

  test('never throws — unserializable details and unwritable homes are swallowed', () => {
    const circular = {};
    circular.self = circular;
    expect(() => logSidecarEvent('circular', { circular })).not.toThrow();

    // Point DEVHUB_HOME at an existing FILE: mkdir/append underneath it fails.
    const fileHome = path.join(tmpHome, 'not-a-dir');
    fs.writeFileSync(fileHome, 'occupied');
    process.env.DEVHUB_HOME = fileHome;
    expect(() => logSidecarEvent('nowhere-to-write', {})).not.toThrow();

    expect(() => logSidecarEvent(null, null)).not.toThrow();
  });
});
