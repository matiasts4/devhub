# Exploration: agent-file-path-open

## Current State

- Agent TUIs (Grok, OpenCode, Kimi, …) run inside xterm (`TerminalTTY` / `useTerminalEngine`). Clicks inject SGR mouse into the TUI (`useTerminalViewportPointer`); there is **no** file-path linkifier and no `@xterm/addon-web-links` dependency.
- DevHub already has a first-class filesystem + editor as a **space component** (`panel.kind === 'files'` → `FileExplorerEditorPane` via `FilesSpacePane`). Opening a file uses `loadFile(path)` → `/api/fs/read?path=…&base=project.local_path`. Tree paths are **POSIX-relative** to the project root.
- Source Control already opens files via `onOpenFile` → same `loadFile` path.
- Shell CWD is tracked (OSC 7 + panel `cwd` prop). Project base is `cwd` / `project.local_path` in `TerminalWorkspacesManager`.
- Workspace events use `window` CustomEvents (`devhub:zed-open-terminal`, `devhub:zed-open-url`). No `devhub:open-file` event yet.
- **No graph path** exists today from TerminalTTY → FileExplorerEditorPane (confirmed via graphify).

## Affected Areas

| Area                                            | Why                                                    |
| ----------------------------------------------- | ------------------------------------------------------ |
| `src/lib/terminal/filePathLinkParse.js`         | NEW — detect path tokens + ranges on a buffer line     |
| `src/lib/terminal/resolveOpenFileTarget.js`     | NEW — absolute/relative → project-relative open target |
| `src/lib/workspace/openFileEvent.js`            | NEW — event contract + pending registry                |
| `src/lib/terminal/agentFilePathLinkProvider.js` | NEW — xterm `ILinkProvider` for Grok/OpenCode          |
| `useTerminalEngine.js`                          | Register/dispose link provider after xterm open        |
| `useTerminalViewportPointer.js`                 | Skip TUI mouse inject when Ctrl/Meta held              |
| `TerminalWorkspacesManager` / zed events hook   | Ensure `files` panel exists + focus                    |
| `FileExplorerEditorPane.jsx`                    | Listen + `loadFile`; expand parents                    |

## Approaches

1. **xterm ILinkProvider + Ctrl/Meta-click + CustomEvent open-file** (recommended)
   - Pros: Works with plain text agents print; no new npm dep; matches VS Code pattern; pure modules testable.
   - Cons: Heuristic path detection (false positives); TUI click conflict mitigated by modifier.
   - Effort: Medium

2. **OSC 8 hyperlinks only**
   - Pros: Precise when emitted.
   - Cons: Grok/OpenCode TUIs rarely emit OSC 8 for every path reference.
   - Effort: Low value alone

3. **Chat/metrics only (not terminal)**
   - Pros: Easy.
   - Cons: Misses the primary “agent mentioned a file in the TUI” UX.
   - Effort: Low (deferred slice)

## Recommendation

Ship approach 1 for **Grok + OpenCode** first: path link provider when session is those agents; **Ctrl+click** (Cmd on macOS) opens in Files space; ensure panel via split if needed.

## Risks

- False positive paths / noise underlines → restrict by extension + path shape; only activate with modifier.
- Click eaten by linkifier without modifier → skip inject only when modifier held; activate only with modifier.
- Files panel not mounted → pending registry until explorer mounts.
- Absolute paths outside project → allow read if API allows; prefer relative under project for tree selection.

## Ready for Proposal

Yes.
