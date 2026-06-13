# Proposal: ZED Hardening

## Intent

The Asistente ZED chat (`src/lib/asistente/` + `/api/assistant/chat`) is **partially functional**: 5 of 9 tools are registered, the param parser mangles 80% of realistic inputs (any value with `=`, `:`, or whitespace), `browse_files` has no path scoping, the stop button is dead, and zero tests exist. Live smoke tests against the dev server on `:3100` confirm the bugs. This change hardens ZED into a reliable assistant: real parser, all tools registered + one new (`close_terminal`), path/URL safety, abortable UI, full result rendering, and a test suite that locks behavior.

## Scope (in)

| File | Change |
|------|--------|
| `src/app/api/assistant/chat/route.js` | Replace broken `parseToolCalls()` (lines 92-101) with `key=value` tokenizer. Register 4 stub tools + new `close_terminal`. Emit "missing required params" result on no-params calls. Externalize system prompt to `docs/prompts/asistente/zed-system-prompt.md`. Name `MAX_TURNS` constant. |
| `src/lib/asistente/tools/registry.js` | No change. Confirmed working. |
| `src/lib/asistente/tools/terminal.js` | Implement `list_terminals` + `review_terminal_output` + `execute_in_terminal` against `/api/terminal/session`. Add `close_terminal` calling `closeTerminalSessionById`. Track sessions in an in-memory `Map`. Pass `program` through to terminal session. |
| `src/lib/asistente/tools/browser.js` | Validate URL with `new URL()` + reject `javascript:`/`data:`/`file:` schemes. Remove orphan `/tmp/devhub-pending-url.txt` write. |
| `src/lib/asistente/tools/files.js` | Add `resolveProjectRoot()` + allow-list (project cwd, `.devhub/`, `/tmp/devhub-*`). Reject escapes with `{ error: 'path outside project root' }`. Truncate `read` to 4KB and add line-count metadata. |
| `src/lib/asistente/tools/swarm.js` | No functional change; update prompt schema only. |
| `src/lib/asistente/index.js` | Re-export new tools (`closeTerminalTool`, etc.). |
| `src/components/asistente/ChatPanel.jsx` | Wire `AbortController` to `fetch` in `handleSend`. Replace `new Date().toISOString()` in initial state with stable `useState` initializer. Use `ToolResult` to render full result body. |
| `src/components/asistente/ToolResult.jsx` | Already exists; wire into ChatPanel. No code change. |
| `docs/prompts/asistente/zed-system-prompt.md` (NEW) | Full 10-tool prompt with params, call format, examples, language match rule. |
| `src/lib/asistente/__tests__/` (NEW) | Unit tests: parser (10+ cases per tool, including bad input), all 10 tools with mocked `fetch`/`fs`/`child_process`, registry. |
| `src/app/api/assistant/chat/__tests__/` (NEW) | Integration: 200/400/500 paths, tool loop, MAX_TURNS exit, no-params feedback, MiniMax mocked. |
| `src/components/asistente/__tests__/` (NEW) | ChatPanel: send → loading → response, stop button aborts, ToolResult renders. |

## Scope (out)

- **F-07** Native `tool_use` blocks (deep API change) — defer to `zed-native-tools` change.
- **F-14** `delegation.js` → `agentLaunchCommand.shared.js` migration — separate change.
- **F-19** Auth/rate-limiting on `/api/assistant/chat` — separate `zed-auth` change.
- **F-21–F-24** P3 cosmetic (badge close, hint text, locale placeholder) — defer.
- F-17 (console.log → zedLog in TerminalWorkspacesManager) — minor; defer.

## Capabilities

### New Capabilities
- `asistente-chat`: Zed chat surface — model client, tool loop, system prompt contract, parser.
- `asistente-tools`: tool registry, file/path sandbox, URL safety, terminal session lifecycle.
- `asistente-ui`: ChatPanel + ToolResult components, abortable fetch, hydration safety.

(No modified capabilities — `openspec/specs/` has no existing asistente spec; this is greenfield.)

## Approach

1. **Parser**: regex `^PARAM:\s*(\w+)\s*=\s*(.*)$` per line, multiline. Trim outer quotes. No whitespace splitting, no rejoin. Handles `=` in values (`https://x=y`), colons (`http://`), and multi-word (`npm test --watch`).
2. **Tool registry**: add 5 registrations in route.js (`listTerminalsTool`, `reviewTerminalTool`, `executeInTerminalTool`, `reviewLogFileTool`, `closeTerminalTool`). Each implements against the real `/api/terminal/session` + `/api/terminal/processes` HTTP API or in-memory session map.
3. **Path sandbox**: `resolveProjectRoot()` returns `process.env.DEVHUB_PROJECT_ROOT || process.cwd()`. `assertWithinRoot(p)` uses `path.resolve` + `startsWith` check. Allow-list also includes `.devhub/` and `/tmp/devhub-*`.
4. **URL safety**: `new URL(p)`, reject schemes not in `['http:', 'https:']`.
5. **AbortController**: create in `handleSend`, pass as `signal` to `fetch`, store in state, `abort()` from `handleStop`.
6. **Hydration**: `useState(() => initialTimestamp)` lazy initializer.
7. **ToolResult**: replace inline `ToolBadge` rendering with `<ToolResult toolName={r.tool} result={r.result} />`.
8. **TDD**: each task = RED test → GREEN impl → REFACTOR, single commit per task.

## LOC estimate

| Area | Lines |
|------|------:|
| `route.js` (parser + 5 registrations + prompt loader + no-params) | +60 |
| `terminal.js` (3 implementations + close_terminal + session map) | +130 |
| `browser.js` (URL validation, remove orphan) | +5 / -3 |
| `files.js` (sandbox + truncation) | +30 |
| `index.js` (re-exports) | +3 |
| `ChatPanel.jsx` (abort + hydration + ToolResult) | +25 |
| `zed-system-prompt.md` (NEW) | +80 |
| `__tests__/` (unit) | +220 |
| `__tests__/` (integration) | +90 |
| `__tests__/` (component) | +90 |
| **Total net** | **~730** |

**Budget**: D2 = 800 net. Headroom 70 lines. If buffer shrinks during apply, defer F-13/F-18 program passthrough and F-15 swarm error differentiation (P2).

## Review Workload Forecast

- **Chained PRs recommended**: No (user: "C2, mantente en esta rama")
- **400-line budget risk**: Medium. Single PR will be ~730 net lines. Mitigated by strict TDD per-task commits so each commit is reviewable.
- **Estimated changed lines**: 730 (well under 800 cap)
- **Decision needed before apply**: No

## Risks

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| Parser regex misses edge case the model produces | Medium | 10+ parser unit tests covering: multi-`=`, `://`, quoted strings, multi-line values, `TOOL:` followed by `PARAM:` on same line, trailing whitespace. Fuzz a few real model outputs from logs. |
| Path sandbox breaks legit access (e.g. model needs to read `node_modules/foo`) | Low | Allow-list `.devhub/` + `/tmp/devhub-*` from day 1; project root is the source of truth. Test both positive and negative paths. |
| Closing a real terminal kills user session unexpectedly | Medium | `close_terminal` requires explicit `session_id`; tool returns dry-run mode if `confirm !== true` parameter absent. |
| AbortController wired wrong → fetch hangs after stop | Low | Component test: click stop mid-request, assert `isLoading=false` within 100ms. |

## Rollback Plan

1. Revert single commit on `feature/session-workspace-restore` (squash-merge style; PR has 1 commit).
2. If parser fix breaks a model output that worked before, the old behavior was "broken silently" — no functional regression in production paths.
3. `close_terminal` is additive — removing it cannot break callers.
4. Path sandbox default (`process.cwd()`) matches prior behavior; only escapes are now blocked.

## Dependencies

- Existing `closeTerminalSessionById` at `@/lib/terminal/closeTerminalSession` — already importable.
- `MINIMAX_API_KEY` in `.env.local` — already set.
- No new packages.

## Success Criteria

- [ ] Live smoke test: `open a new terminal running npm test` produces `command: "npm test"`, terminal session opens with that command.
- [ ] Live smoke test: `browse files at /etc/passwd` returns `{ error: "path outside project root" }`.
- [ ] Live smoke test: `open the url javascript:alert(1)` returns `{ error: "unsupported scheme" }`.
- [ ] Live smoke test: click Stop mid-response → `isLoading` resets within 100ms, no further messages.
- [ ] `npm test` runs all new suites green: parser (10+ cases), 10 tool unit tests, 1 integration, 1 component.
- [ ] No SSR hydration warning in browser console on first load.
- [ ] System prompt lists all 10 tools with `PARAM:` examples per tool.
