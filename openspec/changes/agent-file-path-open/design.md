# Design: agent-file-path-open

## Overview

```
Grok/OpenCode xterm buffer
  → AgentFilePathLinkProvider.provideLinks(y)
  → Ctrl/Cmd+click ILink.activate
  → dispatchOpenFile({ path, line, column, base, source })
  → useOpenFileInWorkspace: ensure files panel + focus
  → FileExplorerEditorPane: resolve + loadFile
```

## Components

### 1. `filePathLinkParse.js` (pure)

```js
export function findFilePathMatches(lineText) → Array<{
  raw, path, line?, column?, startCol, endCol // 0-based indices into line string
}>
```

Heuristics (order matters; non-overlapping left-to-right):

1. Windows absolute: `[A-Za-z]:[\\/][^\s:*?"<>|]+`
2. Unix absolute: `/(?:[^\s:*?"<>|]+/)+[^\s:*?"<>|]+`
3. Relative with slash or known extension: `(?:\.{0,2}/)?[\w./\\-]+\.(js|jsx|ts|tsx|…)`
4. Optional trailing `:line` or `:line:col` (strip from path, store numbers)

Reject pure URLs (`http://`, `https://`). Cap match length (e.g. 512). Prefer extensions list for relatives without `/` only if dotted filename looks like source.

### 2. `resolveOpenFileTarget.js` (pure)

```js
export function resolveOpenFileTarget({ rawPath, projectRoot, cwd }) → {
  ok: boolean,
  openPath: string, // for loadFile / API
  displayPath?: string,
  reason?: string,
}
```

- Normalize `\` → `/` for comparison; use Node-less path logic on client (string ops).
- If absolute and under `projectRoot` → relative posix.
- Else if absolute → pass absolute (API `path.resolve` handles it).
- Else join `cwd` or `projectRoot` + relative; if result under project → relative; else joined path.

### 3. `openFileEvent.js`

| Export                                                                | Role                    |
| --------------------------------------------------------------------- | ----------------------- |
| `OPEN_FILE_EVENT = 'devhub:open-file'`                                | Event name              |
| `dispatchOpenFile(detail)`                                            | Safe window dispatch    |
| `isValidOpenFileEvent(detail)`                                        | `path` non-empty string |
| `reservePendingOpenFile(key, detail)` / `consumePendingOpenFile(key)` | For late Files mount    |

Detail: `{ path, line?, column?, base?, source?, projectId?, workspaceId? }`.

### 4. `agentFilePathLinkProvider.js`

```js
export function createAgentFilePathLinkProvider({
  getLineText, // (bufferLineNumber 1-based) => string
  isEnabled,   // () => boolean  // grok|opencode
  getResolveContext, // () => { projectRoot, cwd }
  onOpen, // (target, meta) => void
})
```

- `provideLinks`: if !isEnabled → callback(undefined); else scan line, build `ILink` with range (xterm 1-based cols).
- `activate(event, text)`: if !(event.ctrlKey \|\| event.metaKey) return; parse text; resolve; onOpen.
- Decorations: underline on hover (default).

### 5. Wire: `useTerminalEngine`

After `terminal.open`:

```js
if (isGrokOrOpenCode(initialCommand)) {
  const disposable = terminal.registerLinkProvider(
    createAgentFilePathLinkProvider({ ... })
  );
  // store for dispose with terminal
}
```

Context: `cwd` prop + project root from props if available; else `cwd` only.

**Note:** `useTerminalEngine` may not have `projectId`. Pass `projectRoot: cwd` from TerminalTTY (workspace cwd is project path). Panel `cwd` may be session cwd — use both when available.

### 6. Wire: `useTerminalViewportPointer`

At start of inject path: if `event.ctrlKey || event.metaKey` → do not schedule TUI mouse injection (`path: 'modifier-file-open'`).

### 7. Wire: open consumer

**A. `useOpenFileInWorkspace` hook** (called from TerminalWorkspacesManager):

- Listen `devhub:open-file`.
- Find panel with `kind === 'files'` in active workspace columns (and windows tree if needed).
- If missing: `splitWithKind('files')`.
- `activateWorkspacePanel` / set active panel id.
- `reservePendingOpenFile(workspaceId, detail)` always (explorer consumes).

**B. `FileExplorerEditorPane`:**

- On mount: `consumePendingOpenFile(workspaceId)` → loadFile.
- Listen event: if valid and (optional) same project → `resolveOpenFileTarget` → `loadFile(openPath)`; expand parent dirs via existing expand prefs if easy.

### 8. Grok / OpenCode enablement

```js
function isAgentFileLinkSession(initialCommand) {
  return (
    isGrokTuiInitialCommand(initialCommand) ||
    isGrokLaunchCommand(initialCommand) ||
    isOpenCodeLaunchCommand(initialCommand)
  );
}
```

## Testing strategy

| Module                     | Cases                                                           |
| -------------------------- | --------------------------------------------------------------- |
| filePathLinkParse          | win abs, posix abs, relative, line:col, url reject, multi match |
| resolveOpenFileTarget      | under project, relative, outside, empty                         |
| openFileEvent              | valid/invalid, pending reserve/consume                          |
| agentFilePathLinkProvider  | disabled, enabled links, activate with/without modifier         |
| useTerminalViewportPointer | optional: modifier skips inject (if testable)                   |

## Alternatives rejected

- WebLinksAddon only for http — wrong target.
- Always-click open — breaks TUI.
- Server-side path rewrite in PTY stream — invasive; agents already print plain text.

## Review forecast

~250–400 LOC prod + ~250 LOC tests. Single PR reviewable if pure modules stay small.
