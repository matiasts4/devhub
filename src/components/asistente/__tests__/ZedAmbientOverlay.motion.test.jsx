'use strict';

const fs = require('fs');
const path = require('path');

const FILE_PATH = path.resolve(__dirname, '..', 'ZedAmbientOverlay.jsx');

function readFile() {
  return fs.readFileSync(FILE_PATH, 'utf8');
}

describe('ZedAmbientOverlay — motion preset migration', () => {
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

  test('pill transition uses the toggle preset', () => {
    expect(source).toMatch(/transition=\{getTransition\(['"]toggle['"],\s*motionMode\)\}/);
  });

  test('aura frame transition uses the fade preset instead of a hardcoded duration', () => {
    expect(source).toMatch(/transition=\{getTransition\(['"]fade['"],\s*motionMode\)\}/);
    expect(source).not.toMatch(/duration:\s*reducedMotion\s*\?\s*0\.01\s*:\s*0\.5/);
  });

  test('no longer hardcodes inline spring stiffness/damping/mass', () => {
    expect(source).not.toMatch(/stiffness:\s*360/);
    expect(source).not.toMatch(/damping:\s*30/);
    expect(source).not.toMatch(/mass:\s*0\.7/);
  });
});
