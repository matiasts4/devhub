'use strict';

const fs = require('fs');
const path = require('path');

const FILE_PATH = path.resolve(__dirname, '..', 'SmartSuggestionsPanel.jsx');

function readFile() {
  return fs.readFileSync(FILE_PATH, 'utf8');
}

describe('SmartSuggestionsPanel — motion preset migration', () => {
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

  test('SuggestionCard uses the open preset transition', () => {
    expect(source).toMatch(/transition=\{getTransition\(['"]open['"],\s*motionMode\)\}/);
  });
});
