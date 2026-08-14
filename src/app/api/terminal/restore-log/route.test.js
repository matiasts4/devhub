/**
 * restore-log route — durable sink for client restore diagnostics.
 * Uses real fs against a tmp DEVHUB_HOME; NextResponse is mocked like the
 * sibling sessions/route.test.js.
 */

const fs = require('fs');
const os = require('os');
const path = require('path');

jest.mock('next/server', () => ({
  NextResponse: {
    json: jest.fn((data, opts) => ({ _data: data, _status: opts?.status || 200 })),
  },
}));

const { POST, GET } = require('./route');

function postRequest(body) {
  return { json: async () => body };
}

function getRequest(query = '') {
  return { url: `http://localhost/api/terminal/restore-log${query}` };
}

describe('/api/terminal/restore-log', () => {
  let tmpHome;
  let savedDevhubHome;
  let logFile;

  beforeEach(() => {
    tmpHome = fs.mkdtempSync(path.join(os.tmpdir(), 'devhub-restorelog-test-'));
    savedDevhubHome = process.env.DEVHUB_HOME;
    process.env.DEVHUB_HOME = tmpHome;
    logFile = path.join(tmpHome, 'logs', 'terminal-restore.jsonl');
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

  function readLogLines() {
    return fs
      .readFileSync(logFile, 'utf8')
      .split('\n')
      .filter((line) => line.trim())
      .map((line) => JSON.parse(line));
  }

  test('POST appends a single entry as client-sourced JSONL', async () => {
    const res = await POST(
      postRequest({ event: 'startup-restore-plan', details: { actionCount: 3 } })
    );

    expect(res._data).toEqual({ ok: true, appended: 1 });
    const lines = readLogLines();
    expect(lines).toHaveLength(1);
    expect(lines[0].source).toBe('client');
    expect(lines[0].event).toBe('startup-restore-plan');
    expect(lines[0].actionCount).toBe(3);
    expect(typeof lines[0].ts).toBe('string');
  });

  test('POST appends a batch array in order', async () => {
    const res = await POST(
      postRequest([
        { event: 'restore-prefs-read', details: { restoreOnReboot: true } },
        { event: 'startup-restore-dispatch', details: { panelId: 'p1' } },
        { event: '' }, // dropped: no event name
        { details: { noEvent: true } }, // dropped: missing event
      ])
    );

    expect(res._data).toEqual({ ok: true, appended: 2 });
    const lines = readLogLines();
    expect(lines.map((l) => l.event)).toEqual(['restore-prefs-read', 'startup-restore-dispatch']);
    expect(lines[1].panelId).toBe('p1');
  });

  test('GET returns the last n parsed entries', async () => {
    await POST(
      postRequest([
        { event: 'e1' },
        { event: 'e2' },
        { event: 'e3', details: { x: 1 } },
      ])
    );

    const res = await GET(getRequest('?n=2'));
    expect(res._data.lines).toHaveLength(2);
    expect(res._data.lines.map((l) => l.event)).toEqual(['e2', 'e3']);
    expect(res._data.lines[1].x).toBe(1);

    const all = await GET(getRequest());
    expect(all._data.lines).toHaveLength(3);
  });

  test('GET tolerates corrupt lines and missing files', async () => {
    fs.mkdirSync(path.dirname(logFile), { recursive: true });
    fs.writeFileSync(
      logFile,
      `${JSON.stringify({ ts: 't', source: 'client', event: 'good' })}\nnot json at all\n{"broken":\n`
    );

    const res = await GET(getRequest());
    expect(res._data.lines).toHaveLength(1);
    expect(res._data.lines[0].event).toBe('good');

    // Missing file → empty, not an error.
    fs.rmSync(logFile);
    const missing = await GET(getRequest());
    expect(missing._data).toEqual({ lines: [] });
  });

  test('fs failures never produce a 500', async () => {
    // Point DEVHUB_HOME at an existing FILE: mkdir/append underneath it fails.
    const fileHome = path.join(tmpHome, 'blocked');
    fs.writeFileSync(fileHome, 'occupied');
    process.env.DEVHUB_HOME = fileHome;

    const post = await POST(postRequest({ event: 'e1' }));
    expect(post._status).toBe(200);
    expect(post._data.ok).toBe(false);

    const get = await GET(getRequest());
    expect(get._status).toBe(200);
    expect(get._data).toEqual({ lines: [] });
  });
});
