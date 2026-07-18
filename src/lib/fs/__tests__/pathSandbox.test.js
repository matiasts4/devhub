const path = require('path');
const { resolveSandboxPath } = require('../pathSandbox');

describe('resolveSandboxPath', () => {
  const base = path.resolve('/workspace/project');

  test('allows nested paths and rejects escapes', () => {
    const ok = resolveSandboxPath(base, 'src/a.js');
    expect(ok.ok).toBe(true);
    expect(ok.relative).toBe('src/a.js');

    const bad = resolveSandboxPath(base, '../secret');
    expect(bad.ok).toBe(false);
  });
});
