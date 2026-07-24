import {
  isAntigravityHostRunning,
  listAntigravityLanguageServers,
  __testables,
} from '../ideHostLiveness.js';

const { parseTasklistCsv, parsePsOutput } = __testables;

describe('ideHostLiveness', () => {
  describe('parseTasklistCsv', () => {
    test('parses CSV rows into {name, pid}', () => {
      const stdout = [
        '"System Idle Process","0","Services","0","8 K"',
        '"Antigravity.exe","12345","Console","1","150,232 K"',
        '"node.exe","999","Console","1","50,000 K"',
      ].join('\r\n');
      const result = parseTasklistCsv(stdout);
      expect(result).toHaveLength(3);
      expect(result[1]).toEqual({ name: 'Antigravity.exe', pid: 12345 });
    });
  });

  describe('parsePsOutput', () => {
    test('parses ps rows into {name, pid, command}', () => {
      const stdout = '  123 /usr/local/bin/antigravity --ide\n  456 node server.js\n';
      const result = parsePsOutput(stdout);
      expect(result).toHaveLength(2);
      expect(result[0]).toMatchObject({ pid: 123, name: 'antigravity' });
      expect(result[0].command).toContain('antigravity --ide');
    });
  });

  describe('isAntigravityHostRunning', () => {
    test('windows: detects Antigravity.exe via tasklist', async () => {
      const exec = jest.fn().mockResolvedValue({
        ok: true,
        stdout:
          '"chrome.exe","1","Console","1","1 K"\r\n"Antigravity.exe","4321","Console","1","2 K"\r\n"agy.exe","777","Console","1","3 K"',
      });
      const result = await isAntigravityHostRunning({ exec, platform: 'win32' });
      expect(exec).toHaveBeenCalledWith('tasklist', ['/FO', 'CSV', '/NH'], {});
      expect(result.running).toBe(true);
      expect(result.pids).toEqual([4321, 777]);
    });

    test('windows: not running when no match', async () => {
      const exec = jest.fn().mockResolvedValue({
        ok: true,
        stdout: '"chrome.exe","1","Console","1","1 K"\r\n"code.exe","2","Console","1","2 K"',
      });
      const result = await isAntigravityHostRunning({ exec, platform: 'win32' });
      expect(result.running).toBe(false);
      expect(result.pids).toEqual([]);
    });

    test('windows: does not match "agy" as substring of other names', async () => {
      const exec = jest.fn().mockResolvedValue({
        ok: true,
        stdout: '"aggregator.exe","10","Console","1","1 K"\r\n"baggy.exe","11","Console","1","1 K"',
      });
      const result = await isAntigravityHostRunning({ exec, platform: 'win32' });
      expect(result.running).toBe(false);
    });

    test('linux: detects via ps', async () => {
      const exec = jest.fn().mockResolvedValue({
        ok: true,
        stdout: '  100 /opt/antigravity/antigravity --no-sandbox\n  200 vim file.txt\n',
      });
      const result = await isAntigravityHostRunning({ exec, platform: 'linux' });
      expect(exec).toHaveBeenCalledWith('ps', ['-axo', 'pid=,command='], {});
      expect(result.running).toBe(true);
      expect(result.pids).toEqual([100]);
    });

    test('exec failure → not running (fail-safe)', async () => {
      const exec = jest.fn().mockResolvedValue({ ok: false, stdout: '' });
      const result = await isAntigravityHostRunning({ exec, platform: 'win32' });
      expect(result).toEqual({ running: false, pids: [] });
    });

    test('exec throws → not running (fail-safe)', async () => {
      const exec = jest.fn().mockRejectedValue(new Error('boom'));
      const result = await isAntigravityHostRunning({ exec, platform: 'darwin' });
      expect(result).toEqual({ running: false, pids: [] });
    });
  });

  describe('listAntigravityLanguageServers', () => {
    test('finds language server processes on unix', async () => {
      const exec = jest.fn().mockResolvedValue({
        ok: true,
        stdout: '  300 /home/u/.gemini/bin/antigravity-language-server --port 9001\n  400 bash\n',
      });
      const result = await listAntigravityLanguageServers({ exec, platform: 'linux' });
      expect(result).toHaveLength(1);
      expect(result[0]).toMatchObject({ pid: 300 });
    });

    test('windows tasklist variant', async () => {
      const exec = jest.fn().mockResolvedValue({
        ok: true,
        stdout: '"antigravity-ls.exe","555","Console","1","10 K"',
      });
      const result = await listAntigravityLanguageServers({ exec, platform: 'win32' });
      expect(result).toHaveLength(1);
      expect(result[0]).toEqual({ name: 'antigravity-ls.exe', pid: 555 });
    });

    test('empty when exec fails', async () => {
      const exec = jest.fn().mockResolvedValue({ ok: false, stdout: '' });
      expect(await listAntigravityLanguageServers({ exec, platform: 'win32' })).toEqual([]);
    });
  });
});
