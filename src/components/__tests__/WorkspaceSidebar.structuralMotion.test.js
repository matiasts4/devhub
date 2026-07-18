const fs = require('fs');
const path = require('path');

const SIDEBAR_PATH = path.resolve(__dirname, '..', 'WorkspaceSidebar.jsx');

describe('WorkspaceSidebar structural motion', () => {
  const src = fs.readFileSync(SIDEBAR_PATH, 'utf8');

  test('does not import framer-motion', () => {
    expect(src).not.toMatch(/from\s+['"]framer-motion['"]/);
  });

  test('snaps width with transition none (no layout springs)', () => {
    expect(src).toMatch(/data-structural-instant=["']true["']/);
    expect(src).toMatch(/transition:\s*['"]none['"]/);
    expect(src).not.toMatch(/\blayout\b\s*[=,}]/);
    expect(src).not.toMatch(/width:\s*['"]auto['"]/);
    expect(src).not.toMatch(/height:\s*['"]auto['"]/);
  });
});
