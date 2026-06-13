# Exploration: zed-terminal-awareness

> Phase: `sdd-explore` (read-only). Generated 2026-06-11. No file edits outside this folder.
> Branch in use: `feature/terminal-renderer-xterm-webgl`. Parallel agent 2 of 4; depends on Agente 1's `displayName` work (panel state + processes API).

## Current State

### Asistente Zed (chat workspace) — surface summary

- The chat surface is `src/lib/asistente/useZedChat.js` (a shared hook used by `ZedAmbientOverlay.jsx`) talking to `POST /api/assistant/chat` (`src/app/api/assistant/chat/route.js`).
- Model: `minimax-coding-plan/MiniMax-M3` (route.js:28). Native `tool_use` blocks preferred; legacy `TOOL:/PARAM:` text parsed by `src/lib/asistente/parseToolCalls.js` (extracted per zed-hardening T-001).
- Tools are registered in `buildRegistry()` (route.js:105-117): `open_terminal`, `list_terminals`, `review_terminal_output`, `execute_in_terminal`, `close_terminal`, `open_url`, `browse_files`, `review_log_file`, `get_swarm_status`. Registry → Anthropic-compatible `input_schema` via `ToolRegistry.toAnthropicTools()` (registry.js:39-55).
- The 4-file rule was respected: read the 14 mandatory files, plus 4 supporting reads (registry.js, processes route, open-url event, dock consumer). No source files modified.

### Existing terminal tools (current behavior vs FR-Z01..Z10)

| FR | Tool | Current state |
|----|------|---------------|
| FR-Z01 | name → terminalId resolution | ❌ Not implemented. `execute_in_terminal` / `close_terminal` / `review_terminal_output` only accept `session_id` (terminal.js:215, 186, 282). `list_terminals` returns the raw `processes` array with no `displayName` (terminal.js:129-180). |
| FR-Z02 | `list_terminals` returns `displayName` | ❌ Not implemented. API surface today: each process has `terminalId, type, cwd?, createdAt?, clients?, shell?, sessionId?` (see `src/app/api/terminal/processes/route.js:16-22,51-58`). No `displayName` field. |
| FR-Z03 | `open_terminal` accepts `name` | ❌ Not implemented. Schema (terminal.js:43-58) has `program, cwd, command, confirm` only. |
| FR-Z05 | `summarize_terminal` tool | ❌ Does not exist. Would need new file `src/lib/asistente/tools/summarizeTerminal.js` + registration in `route.js:105`. |
| FR-Z06 | 2-sentence digest in Spanish | Depends on FR-Z05. The system prompt already instructs the LLM to match the user's language (zed-system-prompt.md:5) and to keep summaries short (the prompt's "After tool execution" guidance at lines 22-29). |
| FR-Z07 | pizarra auto-layout on `open_url` / `open_terminal` | ✅ Mostly works. `dispatchZedOpenUrlFromToolResults` (zedOpenUrlEvent.js:103) + consumer in `TerminalWorkspacesManager.jsx:5529-5548` calls `applyZedOpenUrlDockUpdate` (rightDockLayout.js:109) and schedules two `pizarra:arrange-fit` events at +400ms and +720ms after focus=true. No `demaximize`; the dock enters pizarra mode via `applyZedOpenUrlDockFocus` (rightDockLayout.js:79-99) which sets `maximized: true, maximizedView: 'pizarra'`. `open_terminal` is purely UI-side (`useZedChat.js:179-224` + `zedOpenTerminalEvent.js:66-68`); it does NOT touch pizarra state. |
| FR-Z08 | Spanish errors, no stacks | 🟡 Partial. Tool errors are returned as plain `{ error: "..." }` objects (terminal.js:32, 148, 200, 248, 272; browser.js:18, 21). `useZedChat.js:96-99` shows the error text via `Error: ${error.message}` — *with* a literal `Error:` prefix; bare messages would be cleaner. No translation layer; command policy `reason` strings are in English (e.g. `recursive file deletion (rm -rf)`) and the chat layer does not translate. |
| FR-Z09 | multiline policy | ❌ Implemented as **first-line only** in `normalizeZedTerminalCommand` (zedCommandPolicy.js:118-124): `firstLine.replace(/[;&|]+.*$/, '').trim()`. Anything after `;`, `&`, or `|` is dropped *for that line*, and lines after the first newline are discarded. Pipes through `&&` / heredocs / multi-line scripts would never be re-evaluated. `evaluateZedCommandExecution` (line 168) is the single chokepoint; multiline support would need to: (a) iterate ALL lines through `classifyZedTerminalCommand` with reject-on-any-block semantics, and (b) keep the "first line" only for the `insist_count` key + user-facing `command` echo. The hooks (`guardZedTerminalCommand` in terminal.js:14-23) are already extracted. |
| FR-Z10 | `open_terminal` returns `terminalId` + `displayName` | ❌ Today `open_terminal` does not POST to `/api/terminal/session` (terminal.js:107-125; test at `terminal.list.test.js:15-33` confirms it does NOT call fetch). It returns `{ opened, workspace, cwd, hint, command_sent?, program? }` and instructs the model to call `list_terminals` afterwards to get a usable id. Without a panel id minting path there is no `terminalId` to return yet — would require new minting (or to surface the next `p1`/`p2` from the registry). |

### Browser tool surface (`open_url`)

- `src/lib/asistente/tools/browser.js`: 45 lines. Validates URL via `isSafeHttpUrl` (urlSafety.js), normalizes bare domains, returns `{ opened, workspace, in_app, dock, url, label, focus, message }`. Focus default = true. Does **not** touch `window` (server-safe).
- `src/components/zedOpenUrlEvent.js`: `dispatchZedOpenUrlFromToolResults(toolResults)` (line 103) called from `useZedChat.js:113`. It re-validates URL safety as defense-in-depth (line 129) before dispatching `devhub:zed-open-url` on `window`.
- `src/components/TerminalWorkspacesManager.jsx:5510-5551`: consumer. Listener `handleZedOpenUrl` (a) calls `updateBrowserWindowState` with `pizarraLayoutPriority: focus === true`, (b) calls `updateRightDockState(currentState => applyZedOpenUrlDockUpdate(currentState, { url, focus }))`, (c) when `focus === true` schedules **two** `pizarra:arrange-fit` events at +400ms and +720ms ("After mode transition ~330ms + registry reconcile; refit twice for late surfaces" — line 5541-5547). Idempotent on `(url, label)` via `lastZedOpenUrlRef` (line 5510).

### `/api/terminal/processes` schema (consumer of FR-Z02)

`src/app/api/terminal/processes/route.js:28-67`. Returns:

```js
{
  processes: [
    // Source 1: sidecar PTYs (line 16-22)
    { terminalId, type: 'sidecar', cwd, createdAt, clients },
    // Source 2: local ttyServer (line 51-58)
    { terminalId, sessionId, type: 'pty' | s.type, cwd, shell, createdAt },
  ]
}
```

**No `displayName` field anywhere** — confirmed via grep on the entire `src/app/api/terminal` tree. Consumer is the `list_terminals` tool in `terminal.js:129-180`, which already merges with a tmux discovery fallback (`tmux:NAME` ids, type `tmux`, line 156-172). The list_terminals test (terminal.list.test.js:97-120) only asserts `processes` array shape — no displayName contract yet.

### Command policy — `zedCommandPolicy.js`

- `BLOCKED_PATTERNS` (lines 10-40, 28 rules) + `ALLOWED_PREFIXES` (42-101) + `ALLOWED_EXACT` (103-116). Three tiers: `blocked` (never) / `allowed` (auto) / `approval_required` (dry-run with `action: would_execute`, then `confirm: true`).
- `normalizeZedTerminalCommand` (line 118-124) is the **multiline chokepoint** — currently `firstLine.replace(/[;&|]+.*$/, '').trim()`. Returns empty string → `allowed` with reason `empty-command` (line 128-130).
- `classifyZedTerminalCommand` (line 126-155) returns `{ tier, command, reason, rule_id?, matched_prefix? }`. This is the only function FR-Z09 needs to extend to iterate all lines.
- `evaluateZedCommandExecution` (line 168-208) owns the `command_insist_counts` per-context counter (line 157-166) and the `confirm` flow. Reusable as-is — only the classification feeding it changes.
- Existing test: `src/lib/asistente/__tests__/zedCommandPolicy.test.js`. No multiline coverage.

### System prompt — where to add "Terminales nombradas"

- File: `docs/prompts/asistente/zed-system-prompt.md` (160 lines, loaded once at route init via `loadSystemPrompt()` in `route.js:49-58`).
- Layout: top-level identity (1-9), per-turn behavior (11-33), command safety (35-45), action rules (47-59), tool reference by section number (61-137), ZED Orchestrator Pod (139-148), Rules (150-160).
- **Best insertion point for "Terminales nombradas"**: a new section between the existing `### 9. get_swarm_status` (line 135-137) and the `## ZED Orchestrator Pod` block (line 139). Or, more naturally, extend section `### 2. list_terminals` (line 77-82) with a sub-section that says "Cada terminal tiene un `displayName` humano. Usá `list_terminals` para resolver nombre → terminalId antes de `execute_in_terminal`."
- `displayName` and `terminalId` are **not** mentioned anywhere in the current prompt (grep verified). Also no mention of "name pool", "Chase", or pool sample.

### Test inventory

Unit (under `src/lib/asistente/__tests__/`):

| Path | One-line description |
|------|----------------------|
| `buildZedAmbientStatus.test.js` | status payload builder for ambient overlay |
| `parseToolCalls.test.js` | legacy `TOOL:/PARAM:` parser — 10+ cases |
| `resolveZedApiKey.test.js` | MiniMax key resolution from env / config |
| `zedCommandPolicy.test.js` | policy classification + insist counter |
| `zedOverlayEvents.test.js` | ambient overlay window events |
| `zedSystemPrompt.test.js` | system prompt content rules (multiline-friendly, no raw `TOOL:` strings visible) |
| `tools/browser.test.js` | URL safety + `open_url` return shape |
| `tools/files.test.js` | sandbox + 4KB truncation |
| `tools/pathSandbox.test.js` | path resolution helpers |
| `tools/registry.get.test.js` | `ToolRegistry.get` / `register` / `execute` |
| `tools/terminal.exec.test.js` | `execute_in_terminal` PUT body + `close_terminal` confirm-mode |
| `tools/terminal.list.test.js` | `open_terminal` workspace path, `list_terminals` GET, `review_terminal_output` capture |
| `tools/urlSafety.test.js` | `isSafeHttpUrl` scheme whitelist |

E2E (under `tests/e2e/`):

| Path | One-line description |
|------|----------------------|
| `06_zed_open_terminal.spec.ts` | seeded right-dock + `devhub:zed-open-terminal` dispatch coverage |
| `07_zed_open_url.spec.ts` | `open_url` flow through dock (needs read for full evidence — not read here) |
| `zed-orchestrator-pod.spec.ts` | ZED Orchestrator Pod swarm path (NOT in scope for this change) |
| `commandBar.spec.ts`, `pizarra-shared-view-state.spec.ts`, `terminal-session-restore-post-reboot.spec.ts` | out of scope |

No `terminal.summarize.test.js` exists yet. No tests currently assert `displayName` shape on `list_terminals`.

### zed-hardening leftover tasks (T-001..T-013)

Verified against code with `grep` and direct file reads:

| Task | Status | Evidence |
|------|--------|----------|
| T-001 parseToolCalls | ✅ done | `src/lib/asistente/parseToolCalls.js` exists and is imported by `route.js:13`. The test file `__tests__/parseToolCalls.test.js` exists. |
| T-002 prompt + route wiring | ✅ done | `docs/prompts/asistente/zed-system-prompt.md` exists (160 lines), `loadSystemPrompt()` in `route.js:49-58`, `MAX_TURNS` is a `let` at `route.js:46`. |
| T-003 pathSandbox | ✅ done | `src/lib/asistente/tools/pathSandbox.js` exists. |
| T-004 urlSafety | ✅ done | `src/lib/asistente/tools/urlSafety.js` exists, imported by `browser.js:2` and `zedOpenUrlEvent.js:19`. |
| T-005a open_terminal + list + review | ✅ done | `terminal.js:39-208` matches the spec; `terminal.list.test.js` covers it. |
| T-005b execute + close | ✅ done | `terminal.js:210-307` matches the spec; `terminal.exec.test.js` covers it. |
| T-006 browser hardening | ✅ done | `browser.js` is 45 lines, no `writeFileSync`, uses `isSafeHttpUrl`. |
| T-007 files hardening | ✅ done | `src/lib/asistente/tools/files.js` uses `assertWithinRoot`, 4KB truncation, line count. |
| T-008 registry + route integration | ✅ done | `registry.js:22-24` has `get()`, `route.js:105-117` registers 9 tools. |
| T-009 ChatPanel UI | ✅ done | `useZedChat.js:156-224` shows the `useEffect` dispatching `devhub:zed-open-terminal`. The original `ChatPanel.jsx` was replaced by `useZedChat` + `ZedAmbientOverlay.jsx`. |
| T-011 capture/input routes | ✅ done | `src/app/api/terminal/session/[id]/route.js` exists (parent layout present). |
| T-012 route integration test | 🔲 **open** | No `src/app/api/assistant/chat/__tests__/route.test.js` exists (only `route.test.js` under `terminal/session/[id]/`). |
| T-013 ChatPanel component test | 🔲 **open** | `src/components/asistente/__tests__/ChatPanel.test.jsx` does not exist. Only the ChatPanel → useZedChat refactor happened, so the test target itself moved. |

Hardening is **substantively complete** (T-001..T-011 all done). The two open items (T-012, T-013) are test-only and out of scope for the current change. Recommend closing the tasks.md `[x]` for T-012/T-013 or explicitly deferring them in a follow-up — currently the file marks them `[ ]`.

### ANSI strip + output capture

- No `strip-ansi` dependency in `package.json` (grep negative). No utility module with `stripAnsi` / `ansiRegex` / `ANSI` in `src/lib/asistente` (grep negative across the tree). The only related test mention is in `zedSystemPrompt.test.js:27` referencing "noisy ANSI capture" as a rule for the prompt.
- `getSessionOutput` lives at `src/lib/terminal/ttyServer.js` and is exposed via `GET /api/terminal/session/[id]/capture` (per zed-hardening T-011; route consumed by `review_terminal_output` at `terminal.js:196`). Returns `{ output, session_id }`. No built-in ANSI strip at the route or ttyServer layer.
- For `summarize_terminal`, options are: (a) add `strip-ansi` to deps and strip inside the tool; (b) write a minimal `ansiRegex`-based strip locally (~5 LOC); (c) capture already-stripped text if the sidecar can return plain. **Recommend (b)** — local util, no dep churn.

### Coordination surface with Agente 1 (displayName contract)

There is **no openspec change folder named `terminal-display-names`** (verified — only `pty-identity-binding` and `terminal-panel-state` exist in the spec tree, and both are workspace-level not panel-level). The pool sample of ~30 human names and the rename/mint contract are documented in:

- `docs/delegation/01-agent-terminales.md` (Agente 1 prompt) — line 37 lists the pool sample.
- `docs/delegation/00-shared-context.md` (shared) — line 31 establishes "Pool automático (~30 nombres cortos) al crear + renombrable".

There is **no formal `displayName` field** in `src/app/api/terminal/processes/route.js` today (grep negative across `src/app/api/terminal`). The contract surface Agente 2 should consume:

1. `displayName: string` (human, from pool or user-renamed) on each entry of `processes[]` returned by `GET /api/terminal/processes`.
2. Workspace panel state likely exposes the same field on the panel object that `TerminalWorkspacesManager` renders in the tab strip.
3. The rename API is unspecified in openspec — likely a new method or REST endpoint (need to confirm with Agente 1's exploration result before designing `open_terminal`'s `name` parameter resolution).

Stub strategy (per `02-agent-zed.md:158`): use fixture `{ terminalId: 'p1', displayName: 'Chase' }` in `list_terminals` test until Agente 1 merges.

### Hidden surprises (visible in the files read)

- `useZedChat.js:113` dispatches `dispatchZedOpenUrlFromToolResults` **unconditionally on every assistant message that has tool_results** — including messages whose only `open_url` result is an error. The helper already drops `parsed.error` (zedOpenUrlEvent.js:87) so this is safe, but worth knowing for tests.
- `terminal.js:156-172` enrichment uses `execSync('tmux list-sessions …')` with a 1200ms timeout. If `tmux` is missing, the catch silently swallows (line 174) — fine, but the tool will still report tmux-discovered sessions if the binary exists. No way for the model to distinguish "no tmux" from "tmux is empty".
- The `applyZedOpenUrlDockFocus` (rightDockLayout.js:79-99) and `applyZedOpenUrlDockUpdate` (line 109) both increment `browserLayoutEpoch`; consumer at `TerminalWorkspacesManager.jsx:5529` relies on that epoch change as the trigger for downstream effects. The +400ms and +720ms `pizarra:arrange-fit` timeouts (line 5546-5547) are hard-coded; if any refactor changes the pizarra transition duration, this will silently desync. (Tied to the desktop-engineering note about timing — but here it's zed-driven, not browser-driven.)
- `zedCommandPolicy.js:10-40` has a `file-overwrite-redirect` pattern `/>\s*[^\s&|]+/`. This will match *any* `>` in the input, including in JSON args (e.g. `echo '{"x": ">"}'`). Combined with first-line-only normalization, this is a real false-positive risk for FR-Z09 multiline work. Surface as a known issue.
- `route.js:169-180` uses `resolveZedApiKey()` (a different code path than the audit `06-zed.md:104-108` claims; the audit is stale). Current key resolution supports `MINIMAX_API_KEY` and `data/llm-providers-config.json`; the `ANTHROPIC_API_KEY || MINIMAX_API_KEY` legacy fallback in the audit is no longer the active code. **Do not block on this finding.**
- `useZedChat.js:170-178` persists messages to `sessionStorage` keyed by `sessionKey`. If `displayName` resolution needs cross-turn memory of "the last terminal the user talked about" (for "esa terminal" references), this is a candidate place to thread it — but the system prompt already covers prior-turn resolution (T-WSR-zed-002, zed-system-prompt.md:33).

## Affected Areas

- `src/lib/asistente/tools/terminal.js` — add `summarizeTerminalTool`, extend `open_terminal` / `list_terminals` to accept/return `name` / `displayName` once Agente 1's contract lands.
- `src/lib/asistente/tools/browser.js` — already correct; no change required for FR-Z07.
- `src/lib/asistente/zedCommandPolicy.js` — `normalizeZedTerminalCommand` + `classifyZedTerminalCommand` for FR-Z09 multiline.
- `src/lib/asistente/useZedChat.js` — `resolveByDisplayName` and the `summarize_terminal` UX response (line 113 onward).
- `src/app/api/assistant/chat/route.js` — register `summarizeTerminalTool` in `buildRegistry()`.
- `src/components/zedOpenTerminalEvent.js` / `src/components/zedOpenUrlEvent.js` — no change needed.
- `docs/prompts/asistente/zed-system-prompt.md` — add a "Terminales nombradas" section between section 9 and the ZED Orchestrator Pod block (line 137-139).
- `src/app/api/terminal/processes/route.js` — Agente 1 owns; do not modify.
- `src/lib/terminal/ttyServer.js` — only consume `getSessionOutput`; do not modify.

## Approaches (proposal candidates for next phase)

1. **`summarize_terminal` as a server-side tool** with local ANSI strip + OpenCode footer heuristic.
   - Pros: keeps `useZedChat` thin; one place to evolve heuristics; p95 < 3s is achievable because capture is local.
   - Cons: heuristic layer is novel; will need fixtures. Locale: 200-300 LOC incl. tests.
   - Effort: Medium.

2. **Server-side tool** that delegates the digest to a second LLM call.
   - Pros: handles "long / weird" terminal output more robustly.
   - Cons: doubles latency and cost; defeats NFR-Z01 (< 3s); creates a recursion risk inside the tool loop.
   - Effort: Medium-high. **Reject** — violates NFR-Z01 and is architecturally weird.

3. **`resolveByDisplayName(name, processes)` as a pure helper** (no network) + integrate into `list_terminals`, `open_terminal`, `execute_in_terminal` as an alternative to `session_id` / `terminalId`.
   - Pros: zero new surface; reuses existing tool shapes; case-insensitive + Levenshtein fallback fits NFR-Z02.
   - Cons: changes 3 tool schemas; must add validation that name and session_id are not both set.
   - Effort: Low.

4. **Multiline policy** = iterate `classifyZedTerminalCommand` per line, reject if any line is `blocked`; allow if all lines are `allowed`; require `confirm: true` otherwise. Keep `firstLine` for the user-facing echo.
   - Pros: minimal; uses existing chokepoint.
   - Cons: the `file-overwrite-redirect` pattern (`>`) will need a strict-mode guard.
   - Effort: Low.

**Recommendation**: 1 + 3 + 4 as one change, sequenced in tasks Z1-Z9 as the prompt suggests. Defer 2.

## Risks

- **Agente 1 contract drift**: the `displayName` field is not yet on `processes[]` in code. If Agente 1's spec lands a different field name (e.g. `name`, `alias`) or omits it from `processes[]` and exposes it only on panel state, FR-Z01/Z02 need a second pass. **Mitigation**: keep the resolver pluggable; ship with stub + integration test that runs after Agente 1 merges.
- **Hardcoded `+400ms` / `+720ms` `pizarra:arrange-fit` timeouts** at `TerminalWorkspacesManager.jsx:5546-5547` may desync if the pizarra transition duration changes. Tied to Agente 3's motion work — flag for them.
- **`> ` redirect false-positive** in `classifyZedTerminalCommand` when FR-Z09 evaluates multiline input. Will need a strict-mode rule that allows `>` only inside single-quoted args.
- **`summarize_terminal` p95 latency** depends on `getSessionOutput` cost (8KB cap per NFR-Z01). The current `review_terminal_output` does not cap output (terminal.js:203 returns `data.output || ''`); `summarize_terminal` will need its own client-side slice.
- **T-012 / T-013 leftover** test gaps. Out of scope for this change but the `[ ]` boxes in `zed-hardening/tasks.md` are misleading — should be closed or moved to a follow-up.

## Ready for Proposal

**Yes.** All the foundations for FR-Z01..Z10 are present; the gaps are additive (new tool, new schema fields, new prompt section, new helper). No source files in this change need a destructive edit. The two dependencies (Agente 1's `displayName` integration; the open `T-012/T-013` test files) are well-bounded and can be stubbed.
