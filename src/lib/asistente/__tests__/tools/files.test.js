const fs = require('fs');
const os = require('os');
const path = require('path');

const { fileTool, reviewLogFileTool } = require('../../tools/files');

// We control the project root via env so the tests don't depend on cwd.
const PROJECT_ROOT = fs.mkdtempSync(path.join(os.tmpdir(), 'devhub-files-test-'));
process.env.DEVHUB_PROJECT_ROOT = PROJECT_ROOT;

// Pre-existing files in the project root for positive cases.
fs.writeFileSync(path.join(PROJECT_ROOT, 'note.txt'), 'hello\nworld\n');
fs.mkdirSync(path.join(PROJECT_ROOT, '.devhub'), { recursive: true });
fs.writeFileSync(path.join(PROJECT_ROOT, '.devhub', 'state.json'), '{"k":1}');

// Pre-existing file in /tmp/devhub-* for positive case.
const tmpFile = path.join(os.tmpdir(), `devhub-fixture-${Date.now()}.log`);
fs.writeFileSync(tmpFile, 'a\nb\nc\n');

afterAll(() => {
  fs.rmSync(PROJECT_ROOT, { recursive: true, force: true });
  try {
    fs.unlinkSync(tmpFile);
  } catch {
    /* already gone */
  }
});

describe('browse_files (fileTool)', () => {
  test('rejects /etc/passwd (outside project root)', async () => {
    const r = await fileTool.execute({ action: 'list', path: '/etc/passwd' }, {});
    expect(r.error).toMatch(/path outside project root/i);
  });

  test('rejects .. escape from project root', async () => {
    const r = await fileTool.execute(
      { action: 'list', path: path.join(PROJECT_ROOT, '..', '..', 'etc', 'passwd') },
      {}
    );
    expect(r.error).toMatch(/path outside project root/i);
  });

  test('allows .devhub/state.json', async () => {
    const r = await fileTool.execute(
      { action: 'read', path: path.join(PROJECT_ROOT, '.devhub', 'state.json') },
      {}
    );
    expect(r.error).toBeUndefined();
    expect(r.content).toBe('{"k":1}');
  });

  test('allows /tmp/devhub-* paths', async () => {
    const r = await fileTool.execute({ action: 'read', path: tmpFile }, {});
    expect(r.error).toBeUndefined();
    expect(r.content).toBe('a\nb\nc\n');
  });

  test('read of 20KB file returns <= 4096 bytes content + total line_count', async () => {
    const big = '/tmp/devhub-big-' + Date.now() + '.log';
    const bigContent = Array.from({ length: 1000 }, (_, i) => `line ${i}`).join('\n');
    // bigContent is ~9-10KB; expand to ensure > 4096.
    const expanded = bigContent.repeat(3);
    fs.writeFileSync(big, expanded);
    try {
      const r = await fileTool.execute({ action: 'read', path: big }, {});
      expect(r.error).toBeUndefined();
      expect(r.content.length).toBeLessThanOrEqual(4096);
      expect(r.line_count).toBe(expanded.split('\n').length);
    } finally {
      try {
        fs.unlinkSync(big);
      } catch {
        /* already gone */
      }
    }
  });

  test('read of a directory returns error', async () => {
    const r = await fileTool.execute(
      { action: 'read', path: path.join(PROJECT_ROOT, '.devhub') },
      {}
    );
    expect(r.error).toMatch(/directory/i);
  });

  test('read of missing file returns error', async () => {
    const r = await fileTool.execute(
      { action: 'read', path: path.join(PROJECT_ROOT, 'no-such-file.txt') },
      {}
    );
    expect(r.error).toBeDefined();
  });
});

describe('review_log_file (reviewLogFileTool)', () => {
  test('rejects path outside project root', async () => {
    const r = await reviewLogFileTool.execute({ path: '/etc/passwd' }, {});
    expect(r.error).toMatch(/path outside project root/i);
  });

  test('reads /tmp/devhub-* log file', async () => {
    const r = await reviewLogFileTool.execute({ path: tmpFile }, {});
    expect(r.error).toBeUndefined();
    expect(r.total_lines).toBeGreaterThan(0);
  });
});
