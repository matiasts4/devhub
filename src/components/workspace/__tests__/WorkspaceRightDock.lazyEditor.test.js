const fs = require('fs');
const path = require('path');

const RENDER_PANEL_PATH = path.resolve(
  __dirname,
  '..',
  '..',
  'terminal',
  'components',
  'renderWorkspacePanel.jsx'
);
const DOCK_PATH = path.resolve(__dirname, '..', 'WorkspaceRightDock.jsx');
const TWM_PATH = path.resolve(__dirname, '..', '..', 'TerminalWorkspacesManager.jsx');

describe('WorkspaceRightDock / space files lazy load', () => {
  test('files pane loads via React.lazy in panel slot renderer', () => {
    const src = fs.readFileSync(RENDER_PANEL_PATH, 'utf8');
    expect(src).toMatch(
      /lazy\(\s*\(\)\s*=>\s*import\(\s*['"]@\/components\/workspace\/FileExplorerEditorPane['"]\s*\)/
    );
    expect(src).not.toMatch(
      /import FileExplorerEditorPane from ['"]@\/components\/workspace\/FileExplorerEditorPane['"]/
    );
  });

  test('right dock no longer hosts browser/files panes', () => {
    const src = fs.readFileSync(DOCK_PATH, 'utf8');
    expect(src).not.toMatch(/FileExplorerEditorPane/);
    expect(src).not.toMatch(/WorkspaceBrowserPane/);
  });

  test('TWM does not statically import FileExplorerEditorPane', () => {
    const src = fs.readFileSync(TWM_PATH, 'utf8');
    expect(src).not.toMatch(/import FileExplorerEditorPane from/);
  });
});
