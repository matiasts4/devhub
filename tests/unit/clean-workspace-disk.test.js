const path = require('path');

const scriptPath = path.resolve(__dirname, '../../scripts/clean-workspace-disk.cjs');

describe('clean workspace disk', () => {
  test('default profile keeps release and removes debug/scratch steps', () => {
    const api = require(scriptPath);
    expect(api.profileSteps('default')).toEqual(['safe', 'rust-debug', 'scratch']);
    expect(api.profileSteps('aggressive')).toContain('rust-all');
  });

  test('removeMatchingFiles only targets standalone zip temp files', () => {
    const fs = require('fs');
    const os = require('os');
    const api = require(scriptPath);
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'devhub-clean-'));
    fs.writeFileSync(path.join(tmpDir, 'standalone.zip'), 'ok');
    fs.writeFileSync(path.join(tmpDir, 'standalone.zip.123.tmp'), 'stale');
    fs.writeFileSync(path.join(tmpDir, 'notes.txt'), 'keep');

    const freed = api.removeMatchingFiles(tmpDir, /^standalone\.zip\..+\.tmp$/i);
    expect(freed).toBeGreaterThan(0);
    expect(fs.existsSync(path.join(tmpDir, 'standalone.zip.123.tmp'))).toBe(false);
    expect(fs.existsSync(path.join(tmpDir, 'standalone.zip'))).toBe(true);
  });
});
