# Proposal: agent-file-path-open

## Intent

Let users open filesystem paths referenced in **Grok** and **OpenCode** terminal output into DevHub’s existing Files editor space (Ctrl/Cmd+click), instead of copying paths by hand.

## Scope

### In Scope

- Detect path-like tokens in xterm buffer lines for Grok/OpenCode sessions.
- Ctrl/Cmd+click activates open; plain click keeps TUI mouse behavior.
- Resolve absolute/relative paths against project `local_path` / panel `cwd`.
- Dispatch `devhub:open-file`; ensure a `files` panel exists and focus it; `FileExplorerEditorPane.loadFile`.
- Optional line number from `path:line` / `path:line:col` (scroll best-effort later if unsupported).
- Unit tests for parse, resolve, event contract, link provider, pointer skip.

### Out of Scope

- Kimi / Codex / Hermes (same plumbing later).
- Chat markdown / AgentMetricsCard clickable files (slice 2).
- OSC 8 as sole mechanism.
- In-editor go-to-line scroll guarantee (pass `line` in event for future).
- Opening directories as tree-only focus without file load.

## Capabilities

### New Capabilities

- `agent-file-path-open`: Terminal file-path links for agent TUIs → workspace Files open.

### Modified Capabilities

- None (additive; no existing capability requirements change).

## Approach

Pure parse/resolve modules + xterm `ILinkProvider` registered in `useTerminalEngine` for Grok/OpenCode; CustomEvent bus mirrors `devhub:zed-open-url`; workspace ensures `files` panel; explorer consumes open.

## Affected Areas

| Area                                            | Impact   |
| ----------------------------------------------- | -------- |
| `src/lib/terminal/filePathLinkParse.js`         | New      |
| `src/lib/terminal/resolveOpenFileTarget.js`     | New      |
| `src/lib/terminal/agentFilePathLinkProvider.js` | New      |
| `src/lib/workspace/openFileEvent.js`            | New      |
| `useTerminalEngine.js`                          | Modified |
| `useTerminalViewportPointer.js`                 | Modified |
| `useZedWorkspaceEvents.js` or TWM               | Modified |
| `FileExplorerEditorPane.jsx`                    | Modified |

## Risks

| Risk             | Likelihood | Mitigation                                         |
| ---------------- | ---------- | -------------------------------------------------- |
| TUI click broken | Med        | Modifier-only activate; skip inject when Ctrl/Meta |
| False positives  | Med        | Extension + shape heuristics                       |
| No files panel   | Low        | `splitWithKind('files')` + pending open            |

## Rollback Plan

Feature-flag free; revert commit removes provider + listeners. No schema/migration.

## Dependencies

- Existing Files space (`panel.kind === 'files'`), `loadFile`, `/api/fs/read`.
- Agent detection (`isGrokTuiInitialCommand`, `isOpenCodeLaunchCommand`).

## Success Criteria

- [ ] Ctrl/Cmd+click on a path in Grok TUI opens that file in Files pane.
- [ ] Same for OpenCode.
- [ ] Plain click still injects TUI mouse (no open).
- [ ] Unit tests green for parse/resolve/event/provider.
