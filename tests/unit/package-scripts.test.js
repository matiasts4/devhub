const packageJson = require('../../package.json');

describe('package scripts', () => {
  test('uses Jest for the root test runner instead of next test path parsing', () => {
    expect(packageJson.scripts.test).toContain('jest');
    expect(packageJson.scripts.test).not.toContain('next test');
  });

  test('keeps the root test runner serialized for stable infra verification', () => {
    expect(packageJson.scripts.test).toContain('--runInBand');
  });

  test('exposes a standalone GTK VTE smoke harness command outside product renderer flow', () => {
    expect(packageJson.scripts['native:vte-smoke']).toBe('node scripts/native-vte-smoke.cjs');
  });
});
