'use strict';

const fs = require('fs');
const path = require('path');

const FILE_PATH = path.resolve(__dirname, '..', '..', 'commandBar', 'CommandBar.jsx');

function readFile() {
  return fs.readFileSync(FILE_PATH, 'utf8');
}

describe('CommandBar — motion preset migration', () => {
  let source;

  beforeAll(() => {
    source = readFile();
  });

  test('imports useMotionMode from the global motion context', () => {
    expect(source).toMatch(
      /import\s*\{[^}]*\buseMotionMode\b[^}]*\}\s*from\s+['"]@\/components\/ui\/motion\/MotionModeContext['"]/
    );
  });

  test('imports getTransition from motion-tokens', () => {
    expect(source).toMatch(
      /import\s*\{[^}]*\bgetTransition\b[^}]*\}\s*from\s+['"]@\/components\/ui\/system\/motion-tokens['"]/
    );
  });

  test('command palette transition uses the toggle preset', () => {
    expect(source).toMatch(/transition=\{getTransition\(['"]toggle['"],\s*motionMode\)\}/);
  });

  test('no longer hardcodes inline spring stiffness/damping', () => {
    expect(source).not.toMatch(/stiffness:\s*500/);
    expect(source).not.toMatch(/damping:\s*30/);
  });
});
