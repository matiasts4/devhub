'use strict';

const fs = require('fs');
const path = require('path');

const FILE_PATH = path.resolve(__dirname, '..', 'TerminalTabsManager.jsx');

function readFile() {
  return fs.readFileSync(FILE_PATH, 'utf8');
}

describe('TerminalTabsManager — motion preset migration', () => {
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

  test('terminal body transition uses the toggle preset', () => {
    expect(source).toMatch(/transition=\{getTransition\(['"]toggle['"],\s*motionMode\)\}/);
  });

  test('no longer hardcodes duration/ease for terminal body crossfade', () => {
    // The old inline transition object for the terminal body AnimatePresence.
    expect(source).not.toMatch(/duration:\s*0\.12/);
    expect(source).not.toMatch(/ease:\s*['"]easeInOut['"]/);
  });
});
