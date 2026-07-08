const fs = require('fs');
const os = require('os');
const path = require('path');

describe('build input fingerprint', () => {
  const scriptPath = path.resolve(__dirname, '../../scripts/build-input-fingerprint.cjs');

  test('computeStandaloneBuildFingerprint is stable for the same tree', () => {
    const api = require(scriptPath);
    const first = api.computeStandaloneBuildFingerprint();
    const second = api.computeStandaloneBuildFingerprint();
    expect(first.digest).toBe(second.digest);
    expect(first.fileCount).toBeGreaterThan(10);
  });

  test('shouldSkipStandaloneProductionBuild returns artifacts-missing without zip', () => {
    const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'devhub-fp-'));
    const modulePath = path.join(tmpRoot, 'scripts', 'build-input-fingerprint.cjs');

    fs.mkdirSync(path.dirname(modulePath), { recursive: true });
    fs.writeFileSync(
      modulePath,
      fs
        .readFileSync(scriptPath, 'utf8')
        .replace(
          "const ROOT = path.join(__dirname, '..');",
          `const ROOT = ${JSON.stringify(tmpRoot)};`
        ),
      'utf8'
    );

    jest.resetModules();
    const api = require(modulePath);
    const decision = api.shouldSkipStandaloneProductionBuild();
    expect(decision.skip).toBe(false);
    expect(decision.reason).toBe('artifacts-missing');
  });
});
