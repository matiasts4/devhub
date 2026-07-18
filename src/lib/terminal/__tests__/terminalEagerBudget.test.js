/**
 * @jest-environment node
 *
 * Eager-budget gate: Terminales shell must not statically pull Monaco / explorer editor.
 */

'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '../../..');

function read(rel) {
  return fs.readFileSync(path.join(ROOT, rel), 'utf8');
}

describe('terminal eager budget', () => {
  test('TerminalWorkspacesManager does not static-import Monaco or FileExplorerEditorPane', () => {
    const src = read('components/TerminalWorkspacesManager.jsx');
    expect(src).not.toMatch(/from\s+['"]@monaco-editor/);
    expect(src).not.toMatch(/from\s+['"][^'"]*FileExplorerEditorPane/);
    expect(src).not.toMatch(/require\(\s*['"]@monaco-editor/);
  });

  test('App.js keeps FileExplorerEditorPane off the eager import list (lazy dock only)', () => {
    const src = read('App.js');
    // Static import of the explorer pane would pull Monaco into the shell graph.
    expect(src).not.toMatch(/import\s+FileExplorerEditorPane\s+from/);
    expect(src).not.toMatch(/from\s+['"]@monaco-editor/);
  });

  test('renderWorkspacePanel lazy-loads FileExplorerEditorPane for files spaces', () => {
    const src = read('components/terminal/components/renderWorkspacePanel.jsx');
    expect(src).toMatch(/lazy\s*\(\s*\(\s*\)\s*=>\s*import\s*\(\s*['"].*FileExplorerEditorPane/);
    expect(src).not.toMatch(/import\s+FileExplorerEditorPane\s+from/);
  });
});
