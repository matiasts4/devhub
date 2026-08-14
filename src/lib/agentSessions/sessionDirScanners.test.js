const fs = require('fs');
const os = require('os');
const path = require('path');

function makeTmpHome() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'devhub-session-scanners-'));
}

function writeJson(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(value), 'utf8');
}

function kimiStatePath(home, wdDir, sessionDir) {
  return path.join(home, '.kimi-code', 'sessions', wdDir, sessionDir, 'state.json');
}

function grokSummaryPath(home, cwdDir, sessionDir) {
  return path.join(home, '.grok', 'sessions', cwdDir, sessionDir, 'summary.json');
}

describe('sessionDirScanners', () => {
  let home;

  beforeEach(() => {
    home = makeTmpHome();
  });

  afterEach(() => {
    fs.rmSync(home, { recursive: true, force: true });
  });

  describe('scanKimiSessions', () => {
    test('maps state.json files into resumable kimi sessions', async () => {
      const { scanKimiSessions } = await import('./sessionDirScanners.js');

      writeJson(kimiStatePath(home, 'wd_devhub_a2358e008da2', 'session_1111-aaaa'), {
        createdAt: '2026-07-01T10:00:00.000Z',
        updatedAt: '2026-07-01T10:00:00.000Z',
        title: 'Older',
        workDir: 'D:/devhub',
      });
      writeJson(kimiStatePath(home, 'wd_devhub_a2358e008da2', 'session_2222-bbbb'), {
        createdAt: '2026-07-25T19:27:37.239Z',
        updatedAt: '2026-07-25T19:27:37.239Z',
        title: 'Newest',
        workDir: 'D:/devhub',
        lastPrompt: 'hello',
      });

      const { sessions } = scanKimiSessions({ homeDir: home });

      expect(sessions).toEqual([
        {
          provider: 'kimi',
          sessionId: 'session_2222-bbbb',
          title: 'Newest',
          cwd: 'D:/devhub',
          updatedAt: '2026-07-25T19:27:37.239Z',
          resumeCommand: 'kimi --session session_2222-bbbb',
          durable: true,
        },
        {
          provider: 'kimi',
          sessionId: 'session_1111-aaaa',
          title: 'Older',
          cwd: 'D:/devhub',
          updatedAt: '2026-07-01T10:00:00.000Z',
          resumeCommand: 'kimi --session session_1111-aaaa',
          durable: true,
        },
      ]);
    });

    test('filters by cwd with slash normalization and case-insensitivity on win32', async () => {
      const { scanKimiSessions } = await import('./sessionDirScanners.js');

      writeJson(kimiStatePath(home, 'wd_devhub_x', 'session_3333-cccc'), {
        updatedAt: '2026-07-20T10:00:00.000Z',
        title: 'Match',
        workDir: 'D:\\devhub',
      });
      writeJson(kimiStatePath(home, 'wd_other_y', 'session_4444-dddd'), {
        updatedAt: '2026-07-21T10:00:00.000Z',
        title: 'Other project',
        workDir: 'D:/other',
      });

      const filter = process.platform === 'win32' ? 'd:/DEVHUB' : 'D:/devhub';
      const { sessions } = scanKimiSessions({ cwd: filter, homeDir: home });

      expect(sessions.map((session) => session.sessionId)).toEqual(['session_3333-cccc']);
    });

    test('respects the limit after sorting newest first', async () => {
      const { scanKimiSessions } = await import('./sessionDirScanners.js');

      for (let index = 0; index < 5; index += 1) {
        writeJson(kimiStatePath(home, 'wd_devhub_x', `session_000${index}-id`), {
          updatedAt: `2026-07-0${index + 1}T10:00:00.000Z`,
          title: `S${index}`,
          workDir: 'D:/devhub',
        });
      }

      const { sessions } = scanKimiSessions({ homeDir: home, limit: 2 });

      expect(sessions.map((session) => session.title)).toEqual(['S4', 'S3']);
    });

    test('skips malformed state.json and tolerates a missing sessions dir', async () => {
      const { scanKimiSessions } = await import('./sessionDirScanners.js');

      const badPath = kimiStatePath(home, 'wd_devhub_x', 'session_broken');
      fs.mkdirSync(path.dirname(badPath), { recursive: true });
      fs.writeFileSync(badPath, '{not json', 'utf8');

      expect(scanKimiSessions({ homeDir: home })).toEqual({ sessions: [] });
      expect(scanKimiSessions({ homeDir: path.join(home, 'nope') })).toEqual({ sessions: [] });
    });
  });

  describe('scanGrokSessions', () => {
    test('maps summary.json files into resumable grok sessions', async () => {
      const { scanGrokSessions } = await import('./sessionDirScanners.js');

      writeJson(grokSummaryPath(home, 'D%3A%5Cdevhub', '019f00f7-fb2d-7613-9770-ae88e1d6fb5a'), {
        info: { id: '019f00f7-fb2d-7613-9770-ae88e1d6fb5a', cwd: 'D:\\devhub' },
        session_summary: 'User Greets Grok AI Directly',
        created_at: '2026-06-25T22:47:59.560Z',
        updated_at: '2026-06-28T00:45:02.231Z',
      });
      writeJson(grokSummaryPath(home, 'D%3A%5Cdevhub', 'bbbb-0001'), {
        info: { id: 'bbbb-0001', cwd: 'D:\\devhub' },
        session_summary: 'Earlier chat',
        created_at: '2026-06-20T10:00:00.000Z',
        updated_at: '2026-06-20T10:00:00.000Z',
      });

      const { sessions } = scanGrokSessions({ homeDir: home });

      expect(sessions).toEqual([
        {
          provider: 'grok',
          sessionId: '019f00f7-fb2d-7613-9770-ae88e1d6fb5a',
          title: 'User Greets Grok AI Directly',
          cwd: 'D:\\devhub',
          updatedAt: '2026-06-28T00:45:02.231Z',
          resumeCommand: 'grok --resume 019f00f7-fb2d-7613-9770-ae88e1d6fb5a',
          durable: true,
        },
        {
          provider: 'grok',
          sessionId: 'bbbb-0001',
          title: 'Earlier chat',
          cwd: 'D:\\devhub',
          updatedAt: '2026-06-20T10:00:00.000Z',
          resumeCommand: 'grok --resume bbbb-0001',
          durable: true,
        },
      ]);
    });

    test('filters by cwd normalizing backslashes from info.cwd', async () => {
      const { scanGrokSessions } = await import('./sessionDirScanners.js');

      writeJson(grokSummaryPath(home, 'D%3A%5Cdevhub', 'aaaa-1111'), {
        info: { id: 'aaaa-1111', cwd: 'D:\\devhub' },
        session_summary: 'Match',
        updated_at: '2026-06-28T00:45:02.231Z',
      });
      writeJson(grokSummaryPath(home, 'D%3A%5Cveloce', 'cccc-2222'), {
        info: { id: 'cccc-2222', cwd: 'D:\\veloce' },
        session_summary: 'Other',
        updated_at: '2026-06-29T00:45:02.231Z',
      });

      const { sessions } = scanGrokSessions({ cwd: 'D:/devhub', homeDir: home });

      expect(sessions.map((session) => session.sessionId)).toEqual(['aaaa-1111']);
    });

    test('tolerates missing dirs and skips malformed summaries', async () => {
      const { scanGrokSessions } = await import('./sessionDirScanners.js');

      const badPath = grokSummaryPath(home, 'D%3A%5Cdevhub', 'broken');
      fs.mkdirSync(path.dirname(badPath), { recursive: true });
      fs.writeFileSync(badPath, 'nope', 'utf8');

      expect(scanGrokSessions({ homeDir: home })).toEqual({ sessions: [] });
      expect(scanGrokSessions({ homeDir: path.join(home, 'nope') })).toEqual({ sessions: [] });
    });
  });

  describe('scanCodexSessions', () => {
    test('extracts id/cwd/timestamp from rollout jsonl session meta', async () => {
      const { scanCodexSessions } = await import('./sessionDirScanners.js');

      const rolloutDir = path.join(home, '.codex', 'sessions', '2026', '07', '25');
      fs.mkdirSync(rolloutDir, { recursive: true });
      const id = '9a0a1b2c-3d4e-4f50-8a9b-0c1d2e3f4a5b';
      fs.writeFileSync(
        path.join(rolloutDir, `rollout-2026-07-25T10-00-00-${id}.jsonl`),
        `${JSON.stringify({
          type: 'session_meta',
          payload: { id, cwd: 'D:/devhub', timestamp: '2026-07-25T10:00:00.000Z' },
        })}\n{"type":"turn_context"}\n`,
        'utf8'
      );

      const { sessions } = scanCodexSessions({ homeDir: home });

      expect(sessions).toEqual([
        {
          provider: 'codex',
          sessionId: id,
          title: id,
          cwd: 'D:/devhub',
          updatedAt: '2026-07-25T10:00:00.000Z',
          resumeCommand: `codex resume ${id}`,
          durable: true,
        },
      ]);
    });

    test('skips unparseable rollouts and tolerates a missing sessions dir', async () => {
      const { scanCodexSessions } = await import('./sessionDirScanners.js');

      const rolloutDir = path.join(home, '.codex', 'sessions');
      fs.mkdirSync(rolloutDir, { recursive: true });
      fs.writeFileSync(
        path.join(rolloutDir, 'rollout-broken.jsonl'),
        'garbage\nmore garbage\n',
        'utf8'
      );

      expect(scanCodexSessions({ homeDir: home })).toEqual({ sessions: [] });
      expect(scanCodexSessions({ homeDir: path.join(home, 'nope') })).toEqual({ sessions: [] });
    });
  });

  describe('scanQoderSessions', () => {
    test('parses JSON output from qodercli --list-sessions', async () => {
      const { scanQoderSessions } = await import('./sessionDirScanners.js');

      const execFileImpl = (file, args, options, callback) => {
        expect(file).toBe('qodercli');
        expect(args).toEqual(['--list-sessions']);
        callback(
          null,
          JSON.stringify([
            {
              id: 'q-1',
              title: 'Qoder chat',
              cwd: 'D:/devhub',
              updatedAt: '2026-07-20T10:00:00.000Z',
            },
          ]),
          ''
        );
      };

      const { sessions } = await scanQoderSessions({ execFileImpl, cwd: 'D:/devhub' });

      expect(sessions).toEqual([
        {
          provider: 'qoder',
          sessionId: 'q-1',
          title: 'Qoder chat',
          cwd: 'D:/devhub',
          updatedAt: '2026-07-20T10:00:00.000Z',
          resumeCommand: 'qodercli --resume q-1',
          durable: true,
        },
      ]);
    });

    test('returns unfiltered list when the output carries no cwd info', async () => {
      const { scanQoderSessions } = await import('./sessionDirScanners.js');

      const execFileImpl = (file, args, options, callback) => {
        callback(null, 'q-9 Some chat title\nq-8 Another chat\n', '');
      };

      const { sessions } = await scanQoderSessions({ execFileImpl, cwd: 'D:/devhub' });

      expect(sessions.map((session) => session.sessionId)).toEqual(['q-9', 'q-8']);
      expect(sessions[0].resumeCommand).toBe('qodercli --resume q-9');
      expect(sessions[0].cwd).toBeNull();
    });

    test('resolves to an empty list when the CLI fails or times out', async () => {
      const { scanQoderSessions } = await import('./sessionDirScanners.js');

      const failing = (file, args, options, callback) => {
        const error = new Error('spawn qodercli ENOENT');
        error.code = 'ENOENT';
        callback(error);
      };
      const garbage = (file, args, options, callback) => {
        callback(null, '\n\n', '');
      };

      await expect(scanQoderSessions({ execFileImpl: failing })).resolves.toEqual({
        sessions: [],
      });
      await expect(scanQoderSessions({ execFileImpl: garbage })).resolves.toEqual({
        sessions: [],
      });
    });
  });
});
