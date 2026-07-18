# Tasks: agent-file-path-open

## T1 — Parse + resolve (pure) + tests

- [x] `src/lib/terminal/filePathLinkParse.js` + unit tests
- [x] `src/lib/terminal/resolveOpenFileTarget.js` + unit tests

## T2 — Open-file event contract + pending registry

- [x] `src/lib/workspace/openFileEvent.js` + unit tests

## T3 — xterm link provider + tests

- [x] `src/lib/terminal/agentFilePathLinkProvider.js` + unit tests (mock terminal line)

## T4 — Wire terminal engine + pointer

- [x] Register provider in `useTerminalEngine` for Grok/OpenCode
- [x] Skip TUI inject on Ctrl/Meta in `useTerminalViewportPointer`

## T5 — Workspace ensure files panel + explorer open

- [x] Hook or extend workspace events: ensure `files` panel + focus
- [x] `FileExplorerEditorPane` consume pending + listen `devhub:open-file`

## T6 — Verify

- [x] Run focused Jest suites for new modules
- [ ] Manual smoke notes: Grok + OpenCode Ctrl+click path
