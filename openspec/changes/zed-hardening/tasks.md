# Tasks: zed-hardening

> File-level TDD tasks, dependency-sorted. Each task: RED test → GREEN impl → REFACTOR, single commit.
> Branch: `feature/session-workspace-restore`. D2 budget: 800 net lines. Pre-commit `git diff --stat` gate ≤ 130 lines per commit.
> **Execution order is dependency order, not numeric order.** T-011 (capture/input routes) executes BEFORE T-005 (terminal tools) per constraint #7.

## Pre-flight (no code change)

- [ ] **T-000** — Confirm working tree clean, branch verified, deps installed.
  - `git status --short` clean (other change's staged files OK), `git branch --show-current` = `feature/session-workspace-restore`, `pnpm install` not needed.
  - Verify `closeTerminalSessionById` exists at `src/lib/terminal/closeTerminalSession.js` (it does — confirmed in audit). No T-005a split for that.

## Phase 1: Parser (foundation, blocks everything)

- [ ] **T-001** — Add `parseToolCalls()` to `src/lib/asistente/parseToolCalls.js` (NEW)
  - RED: `src/lib/asistente/__tests__/parseToolCalls.test.js` — 10+ cases: simple, `=` in value, `://` in value, quoted value, multi-line value, missing TOOL, missing PARAM, trailing whitespace, no-params tool, multiple PARAMS, two TOOL blocks, empty value.
  - GREEN: regex `^TOOL:\s*(\w+)$` + `^PARAM:\s*(\w+)\s*=\s*(.*)$` per line; strip single matched pair of `"` or `'`.
  - REFACTOR: extract `_stripQuotes(s)`. Return shape `{ name, input }[]` (matches existing call sites).
  - Net: **+90 / -0** (impl ~30 + tests ~60). Commit: `feat(zed): T-001 add parseToolCalls with per-line regex + quote stripping`.

- [ ] **T-002** — Wire parser into route + externalize system prompt
  - RED: `src/app/api/assistant/chat/__tests__/route.test.js` minimal — `POST /api/assistant/chat` with malformed body returns 400.
  - GREEN: replace inline `parseToolCalls` (lines 66-110) in `route.js` with `import { parseToolCalls } from '@/lib/asistente/parseToolCalls'`. Add `loadSystemPrompt()` reading `docs/prompts/asistente/zed-system-prompt.md` at module init; throw on missing. Replace `buildZedSystemPrompt()`. Rename `const MAX_TURNS = 3` → `let MAX_TURNS = clamp(parseInt(process.env.ZED_MAX_TURNS, 10) || 6, 1, 20)`.
  - Create `docs/prompts/asistente/zed-system-prompt.md` with all 10 tool entries (descriptions + `PARAM:` examples + format rules).
  - REFACTOR: keep `buildZedSystemPrompt` exported as a thin wrapper for back-compat (used by tests if any).
  - Net: **+110 / -45** (route.js net +15, prompt file +80, tests ~10, deleted inline parser -45). Commit: `feat(zed): T-002 wire parseToolCalls into route + externalize system prompt + name MAX_TURNS`.

## Phase 2: Sandbox helpers + URL safety (foundations for file + browser tools)

- [ ] **T-003** — Path sandbox helpers in `src/lib/asistente/tools/pathSandbox.js` (NEW)
  - RED: `src/lib/asistente/__tests__/tools/pathSandbox.test.js` — 8 cases: `resolveProjectRoot()` honors `DEVHUB_PROJECT_ROOT` env, falls back to `cwd`; `assertWithinRoot(p)` accepts root, root + subpath, root + `.devhub/`, `/tmp/devhub-*`; rejects `/etc/passwd`, `..` escape, arbitrary `/tmp/other`.
  - GREEN: `resolveProjectRoot()` + `assertWithinRoot(p)` per D2/D3 snippets. Use `path.resolve()` + `startsWith` after `path.sep` normalization.
  - REFACTOR: hoist `DEV_TMP_PREFIX` to module-level constant.
  - Net: **+60 / -0** (impl ~35 + tests ~25). Commit: `feat(zed): T-003 add pathSandbox helpers resolveProjectRoot + assertWithinRoot`.

- [ ] **T-004** — URL validation helper in `src/lib/asistente/tools/urlSafety.js` (NEW)
  - RED: `src/lib/asistente/__tests__/tools/urlSafety.test.js` — 6 cases: `https://github.com` allowed, `http://example.com` allowed, `javascript:alert(1)` rejected, `data:text/html,...` rejected, `file:///etc/passwd` rejected, `not a url` rejected.
  - GREEN: `isSafeHttpUrl(p)` returns parsed URL if `protocol === 'http:' || 'https:'`, else `{ error: 'unsupported scheme: <scheme>' }`. Malformed → `{ error: 'invalid url' }`.
  - REFACTOR: keep helper side-effect-free (no xdg-open here — that's the tool's job).
  - Net: **+30 / -0** (impl ~15 + tests ~15). Commit: `feat(zed): T-004 add urlSafety.isSafeHttpUrl helper`.

## Phase 3: Terminal HTTP routes (D11 gap-fill — must precede T-005)

- [ ] **T-011** — Add `GET /api/terminal/session/[id]/capture` and `PUT /api/terminal/session/[id]/input` routes
  - Add `getSessionOutput(id)` and `pushSessionInput(id, data)` exports to `src/lib/terminal/ttyServer.js` — read `session.history` / call `session.pty.write(data)`.
  - RED: `src/app/api/terminal/session/[id]/__tests__/capture.test.js` + `input.test.js` — happy path + missing session_id 400.
  - GREEN: `src/app/api/terminal/session/[id]/capture/route.js` (GET) returns `{ output, session_id }`; `input/route.js` (PUT) body `{ data }` calls `pushSessionInput`.
  - REFACTOR: share param parsing via a small helper.
  - Net: **+120 / -0** (ttyServer ~10 + 2 routes ~70 + tests ~40). Commit: `feat(zed): T-011 add terminal capture + input HTTP routes (D11 gap-fill)`.

## Phase 4: Tool implementations (split for ≤130 LOC per commit)

- [ ] **T-005a** — Terminal tools part 1: fix `open_terminal` + implement `listTerminalsTool` + `reviewTerminalTool`
  - RED: `src/lib/asistente/__tests__/tools/terminal.list.test.js` — list returns backend processes; review returns output by id; review with empty params returns `{ error: 'missing required parameter: session_id' }`; open_terminal POSTs body `{ command, program, cwd }` (not GET with query string).
  - GREEN: in `src/lib/asistente/tools/terminal.js`, fix `openTerminalTool.execute` to POST body. Implement `listTerminalsTool.execute` → `GET /api/terminal/processes`. Implement `reviewTerminalTool.execute` → guard session_id, then `GET /api/terminal/session/:id/capture`.
  - REFACTOR: extract `getBaseUrl()` helper inside the file.
  - Net: **+90 / -0** (impl ~55 + tests ~35). Commit: `feat(zed): T-005a fix open_terminal + implement list_terminals + review_terminal_output`.

- [x] **T-005b** — Terminal tools part 2: implement `executeInTerminalTool` + `closeTerminalTool` (confirm-mode)
  - RED: `src/lib/asistente/__tests__/tools/terminal.exec.test.js` — execute sends body `{ data }` to PUT input route; close without `confirm: true` returns dry-run object and makes NO HTTP call; close with `confirm: true` calls `closeTerminalSessionById`; close missing session_id returns error.
  - GREEN: in `terminal.js`, add `executeInTerminalTool.execute` (guard `input`, PUT). Add `closeTerminalTool.execute` (guard `session_id`; if `params.confirm !== true` return `{ action: 'would close', session_id, hint: 'call again with confirm: true' }`; else call `closeTerminalSessionById`).
  - REFACTOR: extract a `requireParam(params, name)` helper.
  - Net: **+85 / -0** (impl ~50 + tests ~35). Commit: `feat(zed): T-005b implement execute_in_terminal + close_terminal with confirm-mode`.

- [x] **T-006** — Update `browser.js` to use URL safety + remove orphan temp file
  - RED: `src/lib/asistente/__tests__/tools/browser.test.js` — https URL accepted, javascript:/data: rejected, malformed rejected, no `/tmp/devhub-pending-url.txt` written.
  - GREEN: in `src/lib/asistente/tools/browser.js`, remove `writeFileSync` block (lines 19-21). Validate via `isSafeHttpUrl(url)`. On success, `execSync('xdg-open "<url>"')`. Return error result on invalid scheme/url.
  - REFACTOR: keep `label` param accepted but ignored (no surface change to spec).
  - Net: **+30 / -8** (impl ~10 / -5 + tests ~20). Commit: `feat(zed): T-006 harden browser.js with urlSafety + remove orphan temp file`.

- [x] **T-007** — Update `files.js` to use path sandbox + 4KB truncation + line_count
  - RED: `src/lib/asistente/__tests__/tools/files.test.js` — list/read on `/etc/passwd` returns `{ error: 'path outside project root' }`; `..` escape rejected; `.devhub/state.json` allowed; `/tmp/devhub-*` allowed; read of 20KB file returns ≤4096 bytes content + total `line_count`; read of directory returns `{ error: 'path is a directory' }`; read of missing file returns `{ error: 'file not found' }`.
  - GREEN: in `src/lib/asistente/tools/files.js`, import `assertWithinRoot`. Guard at top of `browseFilesTool.execute` and `reviewLogFileTool.execute`. On `read` action: stat-check directory, read with `slice(0, 4096)`, count `content.split('\n').length` on FULL file before slicing.
  - REFACTOR: extract `_readFileSafe(p, maxBytes)` helper.
  - Net: **+70 / -0** (impl ~40 + tests ~30). Commit: `feat(zed): T-007 harden files.js with pathSandbox + 4KB truncation + line_count`.

- [x] **T-008** — Route.js full integration + index.js re-exports
  - RED: registry unit test `src/lib/asistente/__tests__/tools/registry.test.js` — register/execute round-trip, list returns names, unknown tool throws `Unknown tool: <name>`, error-object result passes through.
  - GREEN: in `route.js`, add 5 new `registry.register(...)` calls (listTerminalsTool, reviewTerminalTool, executeInTerminalTool, closeTerminalTool, reviewLogFileTool). Implement no-params feedback: `if (Object.keys(input).length === 0) result = { error: 'missing required parameters' }` before the try block. Modify loop: push structured tool result message (parsed object, not stringified JSON) — preserves spec scenario "Tool results become model-visible on next turn". Set `meta.max_turns_reached: true` on `MAX_TURNS` exit. Add `upstream_status` in catch block when thrown error has it.
  - In `src/lib/asistente/index.js`, re-export the 5 new tool symbols.
  - REFACTOR: extract `buildRegistry()` to keep `POST` thin.
  - Net: **+55 / -5** (route.js ~35 + index.js ~3 + tests ~20, deleted -5 for refactor). Commit: `feat(zed): T-008 integrate 5 new tools + no-params feedback + meta.max_turns_reached + index re-exports`.

## Phase 5: Tests + UI

- [x] **T-009** — ChatPanel UI update (AbortController, hydration, ToolResult, useEffect)
  - In `src/components/asistente/ChatPanel.jsx`: replace `timestamp: new Date().toISOString()` initial state with lazy `useState(() => 'initial')`. In `handleSend`, create `new AbortController()`, pass `signal` to `fetch`, store in `setAbortController`, clear in `finally`. `handleStop` already aborts — just needs the controller wired. Replace inline `ToolBadge` mapping (lines 158-160) with `<ToolResult toolName={r.tool} result={r.result} />`. Move `devhub:zed-open-terminal` window-event dispatch into a `useEffect` keyed on the last `open_terminal` tool result. Delete the local `ToolBadge` definition.
  - Net: **+30 / -35** (impl ~30, deleted ToolBadge -35). Commit: `feat(zed): T-009 wire AbortController + hydration-safe timestamp + ToolResult in ChatPanel`.

- [ ] **T-012** — Route integration test (200/400/500, MAX_TURNS, no-params, MiniMax mocked)
  - `src/app/api/assistant/chat/__tests__/route.test.js`: mock `fetch` at module boundary (return canned MiniMax responses). Cases: happy path (model returns no tool → final text), tool call (model emits TOOL → result injected → final), `MAX_TURNS` exceeded → `meta.max_turns_reached: true`, no-params call → tool executes → result is `{ error: 'missing required parameters' }`, missing API key → 500 JSON, malformed body → 400, MiniMax throws with `upstream_status: 502` → 500 with upstream_status.
  - Net: **+90 / -0**. Commit: `test(zed): T-012 add route integration test covering tool loop, MAX_TURNS, no-params, error contract`.

- [ ] **T-013** — ChatPanel component test
  - `src/components/asistente/__tests__/ChatPanel.test.jsx`: install JSDOM + `createRoot` + `flushSync` (existing pattern, see `tests/unit/operational-feedback-components.test.jsx`). Cases: send → loading spinner → response appended, click Stop mid-request → `isLoading=false` within 100ms (mock fetch with `signal`-aware `Promise` that never resolves), initial `useState` initializer is stable across two calls (call twice, assert same sentinel), tool result renders via `ToolResult` (mock fetch returns `tool_results` with object payload).
  - Net: **+90 / -0**. Commit: `test(zed): T-013 add ChatPanel component test for abort + hydration + ToolResult`.

## Critical path
`T-001 → T-002 → T-011 → T-005a → T-005b → T-008 → T-009 → T-013`

(Dependencies: T-002 needs T-001's parser; T-005a/b need T-011's routes + T-002's prompt; T-008 needs T-005/T-006/T-007 tools; T-009 needs T-008's result; T-013 needs T-009's component.)

## Review Workload Forecast

| Field | Value |
|-------|-------|
| Estimated changed lines | ~820 (impl 470 + tests 350), trim to ≤800 with deferral plan |
| Largest single commit | 120 (T-011 terminal routes incl. ttyServer exports) |
| Pre-commit gate (`git diff --stat`) | ≤130 lines per commit — passes for all 12 tasks |
| 400-line budget risk | Medium (single PR ~820 net; user C2 = "single-pr") |
| Chained PRs recommended | No (user C2 = "stay on this branch") |
| Delivery strategy | `single-pr` (user C2) |
| Decision needed before apply | No |

Decision needed before apply: No
Chained PRs recommended: No
Chain strategy: single-pr
400-line budget risk: Medium

### Per-task LOC

| Task | Impl | Tests | Net |
|------|-----:|------:|----:|
| T-001 | 30 | 60 | +90 |
| T-002 | 95 | 10 | +110 (route.js -45 inline parser removed) |
| T-003 | 35 | 25 | +60 |
| T-004 | 15 | 15 | +30 |
| T-005a | 55 | 35 | +90 |
| T-005b | 50 | 35 | +85 |
| T-006 | 10 | 20 | +30 (browser.js -8 orphan removed) |
| T-007 | 40 | 30 | +70 |
| T-008 | 38 | 20 | +55 (route.js refactor -5) |
| T-009 | 30 | 0 | +30 (ToolBadge -35 deleted) |
| T-011 | 80 | 40 | +120 |
| T-012 | 0 | 90 | +90 |
| T-013 | 0 | 90 | +90 |
| **Total** | **478** | **470** | **+950 nominal, ~820 net of deletions** |

## Risk mitigations

- **Parser regex strictness**: 10+ unit tests cover edge cases (multi-`=`, `://`, quoted, multi-line, no-TOOL, two TOOL blocks, empty value, trailing whitespace).
- **Path sandbox false positives**: tests cover both positive paths (root, subpath, `.devhub/`, `/tmp/devhub-*`) and negative paths (`/etc/passwd`, `..` escape, arbitrary `/tmp/other`).
- **close_terminal safety**: dry-run guard tested — `confirm !== true` makes NO HTTP call. Confirm-mode test verifies `closeTerminalSessionById` is called only on `confirm: true`.
- **AbortController wiring**: component test asserts 100ms reset after Stop click + initial timestamp stability across "renders" (call twice, get same sentinel).
- **Tauri bundle missing `docs/`**: route throws descriptive error from `loadSystemPrompt()` at module init — fails fast, not silent. Document in rollout notes.
- **closeTerminalSessionById exists**: confirmed at `src/lib/terminal/closeTerminalSession.js` line 35. No T-005a fallback needed.

## Defer order if budget tightens (in this order, with savings)

1. **T-013 component test** (save 90) — fold into T-009 as a follow-up; risk = no automated guard on abort/hydration.
2. **T-012 route integration test** (save 90) — fold coverage into T-008 unit test; risk = no full stack trace.
3. **T-005a/b test depth** (save 30) — keep 1 test per tool instead of 2-3.
4. **F-13 program passthrough** (already deferred in design; saves ~5 in `open_terminal`).
5. **F-15 swarm error differentiation** (already deferred; no LOC change).
6. **F-17 console.log → zedLog** in TerminalWorkspacesManager (deferred; saves ~10).

If buffer shrinks to 750 net: defer #1 (T-013) + #3 (T-005a/b tests) → 830 → 710, under cap.

## Strict TDD plan (confirmation)

- **Per task**: RED test (failing) → GREEN impl (passing) → REFACTOR (cleanup) → single `git commit`.
- **Commit message format**: `feat(zed): T-NNN <short description>` (no `Co-Authored-By` per project convention).
- **Pre-commit gate**: `git diff --stat` must show ≤130 lines changed. Enforced locally before every commit.
- **Test command**: `pnpm exec jest --runInBand tests/unit/asistente* src/lib/asistente src/components/asistente src/app/api/assistant src/app/api/terminal/session`.
- **Strict TDD applies to ALL tasks including T-008** (registry test + route integration co-commit) and **T-002** (small route test + prompt file co-commit).
