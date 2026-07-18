# Apply progress: agent-file-path-open

## Done

| Task                                               | Status                     |
| -------------------------------------------------- | -------------------------- |
| T1 Parse + resolve + tests                         | Done                       |
| T2 openFileEvent + tests                           | Done                       |
| T3 agentFilePathLinkProvider + tests               | Done                       |
| T4 useTerminalEngine + viewport pointer            | Done                       |
| T5 useOpenFileInWorkspace + FileExplorerEditorPane | Done                       |
| T6 Unit verify                                     | Done (26/26 focused tests) |

## Files

### New

- `src/lib/terminal/filePathLinkParse.js`
- `src/lib/terminal/resolveOpenFileTarget.js`
- `src/lib/terminal/agentFilePathLinkProvider.js`
- `src/lib/workspace/openFileEvent.js`
- `src/components/terminal/hooks/useOpenFileInWorkspace.js`
- Tests under `src/lib/terminal/__tests__/*`, `src/lib/workspace/__tests__/openFileEvent.test.js`
- SDD: `openspec/changes/agent-file-path-open/*`

### Modified

- `src/components/terminal/hooks/useTerminalEngine.js` — register link provider for Grok/OpenCode
- `src/components/terminal/hooks/useTerminalViewportPointer.js` — skip TUI inject on Ctrl/Meta
- `src/components/TerminalWorkspacesManager.jsx` — ensure Files panel on open-file
- `src/components/workspace/FileExplorerEditorPane.jsx` — consume open-file + pending

## Manual smoke (pending user)

1. Open Grok in a project workspace.
2. Wait until agent prints a path under the project (e.g. after edit/read).
3. **Ctrl+click** (Cmd on macOS) the path → Files panel opens with that file.
4. Plain click still interacts with TUI.
5. Repeat with OpenCode.
