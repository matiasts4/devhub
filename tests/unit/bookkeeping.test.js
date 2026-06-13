const fs = require('fs');
const path = require('path');
const ROOT = path.resolve(__dirname, '../../');

describe('bookkeeping — morphology + terminal-zone reconciliation', () => {
  test('morphology-system-refactor/tasks.md marks Roadmap borderRadius literals resolved', () => {
    const tasks = fs.readFileSync(
      path.join(ROOT, 'openspec/changes/morphology-system-refactor/tasks.md'),
      'utf8'
    );
    expect(tasks).toMatch(/\[x\].*[Rr]oadmap.*[Bb]order[Rr]adius/);
  });

  test('terminal-zone-appearance/verify-report.md exists', () => {
    expect(
      fs.existsSync(path.join(ROOT, 'openspec/changes/terminal-zone-appearance/verify-report.md'))
    ).toBe(true);
  });
});
