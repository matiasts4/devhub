# Design: ZED Hardening

> **Change**: `zed-hardening`
> **Capabilities covered**: `asistente-chat`, `asistente-tools`, `asistente-ui`
> **Spec contracts**: 25 requirements / 78 scenarios
> **LOC budget**: 730 net / 800 cap (headroom 70)

## Technical Approach

Replace ZED's broken `parseToolCalls`, expand the tool registry from 5 to 10, add a path/URL sandbox, externalize the system prompt, wire `AbortController` into the chat UI, and lock all behavior with a Jest test suite (TDD per-task). The textual `TOOL:` / `PARAM:` protocol is preserved — the model already speaks it, and switching to native `tool_use` blocks is a separate `zed-native-tools` change.

The shape of the change is **one vertical slice through 4 layers** (parser → tools → route → UI) so each commit is reviewable end-to-end and any regression is caught by the test that landed with the change.

## Architecture Decisions

### D1 — Parser algorithm: per-line regex with quote-stripping

**Choice**: Per-line regex parser. Split `rawText` by `\n`, scan each line against two anchored patterns (`^TOOL:\s*(\w+)` and `^PARAM:\s*(\w+)\s*=\s*(.*)$`), then a post-pass strips a single matched pair of leading/trailing `"` or `'` from each value.

**Alternatives considered**:
- **State machine with tokenizer**: Overkill for a strict line grammar. No real benefit; harder to test.
- **Line splitter + heuristic `indexOf('=')`**: Same complexity as regex, no quote-stripping, more edge cases.

**Rationale**: The grammar is line-oriented (`TOOL:` on its own line, `PARAM:` lines following). Regex captures the grammar in 4 lines of code, is easy to test with 10+ fixtures (multi-`=`, `://`, quoted, multi-line, empty value, no-tool lines), and locks the contract that "everything after the first `=` is the value".

**Snippet** (`src/app/api/assistant/chat/route.js`):
```js
const TOOL_RE  = /^TOOL:\s*(\w+)\s*$/i
const PARAM_RE = /^PARAM:\s*(\w+)\s*=\s*(.*)$/i

function stripQuotes(s) {
  return (s.length >= 2 &&
    ((s[0] === '"' && s[s.length-1] === '"') ||
     (s[0] === "'" && s[s.length-1] === "'")))
    ? s.slice(1, -1) : s
}

export function parseToolCalls(rawText) {
  const calls = []
  let current = null
  for (const line of String(rawText ?? '').split('\n')) {
    const trimmed = line.trim()
    const tm = TOOL_RE.exec(trimmed)
    if (tm) { current = { tool: tm[1], params: {} }; calls.push(current); continue }
    const pm = PARAM_RE.exec(trimmed)
    if (pm && current) { current.params[pm[1]] = stripQuotes(pm[2].trim()); continue }
  }
  return calls.map(c => ({ name: c.tool, input: c.params }))
}
```

### D2 — Project root resolution: env-var with cwd fallback

**Choice**: `resolveProjectRoot()` returns `process.env.DEVHUB_PROJECT_ROOT || process.cwd()`. Single function, single source of truth, exported from `src/lib/asistente/tools/files.js` so all path-resolving tools import the same value.

**Alternatives considered**:
- **`process.cwd()` only**: Breaks when the dev server is started from a parent directory (e.g. monorepo workspace). The env-var override exists for exactly this case.
- **Env var only**: Breaks local `node` invocations and ad-hoc scripts.
- **Walk-up search for `package.json`**: Overkill; the workspace root is well-known at boot.

**Rationale**: The dev server is always launched from the project root in dev and from a known `APPDIR` in production. The env var is the escape hatch when the server is launched from a parent directory (test harness, e2e suite).

### D3 — Path allow-list: cwd + `.devhub/` + `/tmp/devhub-*`

**Choice**: `assertWithinRoot(p)` returns `true` iff `path.resolve(p)` is one of:
1. Inside `resolveProjectRoot()` (prefix check on resolved absolute path).
2. Inside `${resolveProjectRoot()}/.devhub/` (explicit prefix — included in case the root itself is narrower than the project tree, e.g. a worktree).
3. Matches the glob `/tmp/devhub-*` (devhub scratch space — used by sidecar and the existing `/tmp/devhub-pending-url.txt` pattern).

**Rationale**: Prefix check via `startsWith` after `path.resolve` is the only safe pattern (`..`-aware). Allowing `.devhub/` and `/tmp/devhub-*` from day 1 prevents the sandbox from breaking legit access (config files, scratch logs).

**Snippet**:
```js
import path from 'node:path'
import os from 'node:os'

export function resolveProjectRoot() {
  return process.env.DEVHUB_PROJECT_ROOT || process.cwd()
}

const DEV_TMP_PREFIX = path.join(os.tmpdir(), 'devhub-')

export function assertWithinRoot(p) {
  const resolved = path.resolve(p)
  const root = resolveProjectRoot()
  if (resolved === root) return true
  if (resolved.startsWith(root + path.sep)) return true
  if (resolved.startsWith(path.join(root, '.devhub') + path.sep)) return true
  if (resolved.startsWith(DEV_TMP_PREFIX)) return true
  return false
}
```

### D4 — URL scheme validation: allow-list

**Choice**: `new URL(p)` parse; accept only `protocol === 'http:' || protocol === 'https:'`. Reject `javascript:`, `data:`, `file:`, `vbscript:`, `ftp:`, malformed strings.

**Rationale**: Allow-list is safer than block-list — we enumerate the safe set rather than enumerate the dangerous set. `new URL(...)` throws on malformed input; catch the throw and return `{ error: 'invalid url' }`.

### D5 — `close_terminal` confirm-mode: explicit `confirm: true`

**Choice**: Tool accepts `{ session_id, confirm }`. If `confirm !== true` (boolean strict equality), return a dry-run object `{ action: 'would close', session_id, hint: 'call again with confirm: true' }`. Only when `confirm === true` does it call the backend.

**Rationale**: Destructive ops behind a typed gate. The model can preview before committing; the user gets a natural-language "are you sure?" round-trip.

### D6 — `MAX_TURNS` default 6, env-overridable

**Choice**: `MAX_TURNS = 6` as an exported mutable `let` in `route.js`. Overridable at module init: `MAX_TURNS = clamp(parseInt(process.env.ZED_MAX_TURNS, 10) || 6, 1, 20)`. Exported so tests can read the constant.

**Rationale**: 3 was too tight (the audit's smoke tests already hit the cap). 6 is the smallest value that covers "list + open + execute + read + answer" chains. Env override exists for soak tests and emergency throttle. 20 ceiling prevents runaway loops from `MAX_TURNS=0` typos.

### D7 — System prompt location and loading: file at module init

**Choice**: `docs/prompts/asistente/zed-system-prompt.md`. Loaded **once** via `fs.readFileSync` at module init, cached in a module-level `let systemPrompt`. Throw a descriptive error at module init if the file is missing (route never silently misconfigures). No hot-reload, no env override — the prompt is content, not config.

**Rationale**: Hot-reload and env override are over-engineering for a 80-line prompt that's version-controlled. Throw-on-missing prevents the route from serving a partial model with a stale hardcoded prompt.

**File path** (`src/app/api/assistant/chat/route.js`):
```js
import fs from 'node:fs'
import path from 'node:path'

const PROMPT_PATH = path.join(process.cwd(), 'docs/prompts/asistente/zed-system-prompt.md')
let SYSTEM_PROMPT = null
function loadSystemPrompt() {
  if (SYSTEM_PROMPT) return SYSTEM_PROMPT
  if (!fs.existsSync(PROMPT_PATH)) {
    throw new Error(`System prompt not found at ${PROMPT_PATH}. Run \`mkdir -p docs/prompts/asistente\` and create the file.`)
  }
  SYSTEM_PROMPT = fs.readFileSync(PROMPT_PATH, 'utf8')
  return SYSTEM_PROMPT
}
```

### D8 — `AbortController` ownership: per-request

**Choice**: Each `handleSend` creates a fresh `AbortController`, stores it in `useState`, passes `signal` to `fetch`, clears the state in `finally`. `handleStop` calls `.abort()` and sets `isLoading=false`.

**Alternatives considered**:
- **Shared controller**: Cancels the wrong in-flight request if the user clicks Stop on a stale UI. Bad.
- **useRef only**: Loses render reactivity; can't drive the "Stop button only visible when in flight" UX off state.

**Rationale**: Per-request + state is the only pattern that supports (a) concurrent aborts cleanly and (b) the visibility UX.

### D9 — Tool result rendering: wire existing `ToolResult.jsx`

**Choice**: The `ToolResult.jsx` component already exists, has the right contract (`{ toolName, result, error }`), and renders pretty JSON. Replace the inline `ToolBadge` mapping in `ChatPanel.jsx` with `<ToolResult toolName={r.tool} result={r.result} />`. The `open_terminal` `devhub:zed-open-terminal` window-event dispatch moves into the `ToolResult` useEffect (or stays as a post-render side effect in ChatPanel — TBD by the apply task).

**Rationale**: Extending the existing component is zero-cost; the alternative is rewriting the same shape under a new name.

### D10 — Test runner: Jest (already used)

**Choice**: `pnpm exec jest` (Jest 29+, devhub default). 74 test files already in `tests/unit/`. Component tests use `jsdom` + raw `react-dom/client.createRoot` (see `tests/unit/operational-feedback-components.test.jsx`). React Testing Library is **not** currently used for component tests; we follow the existing pattern (manual JSDOM + `createRoot` + `flushSync`).

**Rationale**: Match the existing test pattern. Introducing RTL is a separate concern (would need a `jest-environment-jsdom` config toggle since the root `jest.config.js` uses `testEnvironment: 'node'`).

### D11 — Terminal capture/input endpoints (gap-fill)

**Spec gap discovered**: The spec requires `GET /api/terminal/session/:id/capture` and `PUT /api/terminal/session/:id/input`, but only `GET /api/terminal/session` (open) and `DELETE /api/terminal/session` (close) exist.

**Choice**: Add two thin route files:
- `src/app/api/terminal/session/[id]/capture/route.js` — `GET` returns the session's accumulated output buffer.
- `src/app/api/terminal/session/[id]/input/route.js` — `PUT` with body `{ data }` calls `ttyServer.pushInput(sessionId, data)`.

Both delegate to existing `ttyServer.js` helpers (no new socket logic — just HTTP shims). ~40 LOC each, included in the 130-line terminal.js budget.

## Architecture

```
ChatPanel.handleSend
  └─> fetch POST /api/assistant/chat  (signal: abortController.signal)  [D8]
       └─> route.js
            ├─> loadSystemPrompt()                                [D7]
            ├─> apiKey = MINIMAX_API_KEY || ANTHROPIC_API_KEY     (→ 500 if missing)
            ├─> registry = new ToolRegistry()
            │    ├─> register(openTerminalTool)                   [10 tools, see D11]
            │    ├─> register(listTerminalsTool)
            │    ├─> register(reviewTerminalTool)
            │    ├─> register(executeInTerminalTool)
            │    ├─> register(closeTerminalTool)                  [D5 confirm-mode]
            │    ├─> register(browserTool)                        [D4 URL allow-list]
            │    ├─> register(delegationTool)
            │    ├─> register(fileTool)                           [D2/D3 path sandbox]
            │    ├─> register(reviewLogFileTool)                  [D2/D3 path sandbox]
            │    └─> register(swarmTool)
            └─> loop turn < MAX_TURNS=6 (ZED_MAX_TURNS override)  [D6]
                 ├─> callMinimax(messages, system, apiKey)        (→ 500 + upstream_status on throw)
                 ├─> toolCalls = parseToolCalls(rawText)          [D1]
                 │    └─> emits `{ name, input }[]`
                 ├─> if !toolCalls → finalText = rawText; break
                 └─> for each call:
                      ├─> params === {} ?
                      │    └─> execute anyway; tool returns { error: 'missing required parameters' }
                      ├─> result = await registry.execute(name, input)
                      │    └─> tool-specific impl:
                      │         ├─> fileTool / reviewLogFileTool → assertWithinRoot() [D2/D3]
                      │         │     reject with { error: 'path outside project root' }
                      │         ├─> browserTool → new URL() protocol check [D4]
                      │         ├─> closeTerminalTool → if confirm !== true: dry-run [D5]
                      │         └─> listTerm/reviewTerm/executeTerm → HTTP [D11]
                      └─> allToolResults.push({ tool, input, result })
                 └─> inject: conversation.push(assistant rawText) + tool result messages
                     (assistant-visible content, not stringified JSON)
```

**Key loop invariants** (locked by spec):
- Loop terminates on no-tool-call response OR `MAX_TURNS` reached.
- On `MAX_TURNS` reached, response body includes `meta.max_turns_reached: true` and the last assistant text.
- No-params calls execute anyway and inject `{ error: 'missing required parameters' }` so the model sees feedback.

## File Changes

| File | Action | LOC | Description |
|------|--------|----:|-------------|
| `src/app/api/assistant/chat/route.js` | Modify | +60 | Replace `parseToolCalls`, register 5 new tools, add prompt loader, name `MAX_TURNS`, return `meta.max_turns_reached` on overflow |
| `src/app/api/assistant/chat/__tests__/route.test.js` | **Create** | +90 | Integration: 200/400/500, MAX_TURNS, no-params feedback |
| `src/lib/asistente/tools/registry.js` | No change | 0 | Confirmed working in audit |
| `src/lib/asistente/tools/terminal.js` | Modify | +130 | Implement `listTerm`/`reviewTerm`/`executeTerm`/`closeTerm` against `ttyServer` + new HTTP routes |
| `src/lib/asistente/tools/browser.js` | Modify | +5 / -3 | URL scheme allow-list; remove orphan temp-file write |
| `src/lib/asistente/tools/delegation.js` | No change | 0 | Defer F-14 |
| `src/lib/asistente/tools/files.js` | Modify | +30 | `resolveProjectRoot()` + `assertWithinRoot()` + 4KB truncation + line_count |
| `src/lib/asistente/tools/swarm.js` | No change | 0 | Defer F-15 (table-missing differentiation) |
| `src/lib/asistente/index.js` | Modify | +3 | Re-export new tool symbols |
| `src/lib/asistente/__tests__/parseToolCalls.test.js` | **Create** | +60 | 10+ parser cases |
| `src/lib/asistente/__tests__/tools/terminal.test.js` | **Create** | +60 | 4 tool impls with mocked `fetch` |
| `src/lib/asistente/__tests__/tools/browser.test.js` | **Create** | +30 | URL scheme allow-list + orphan-file assertion |
| `src/lib/asistente/__tests__/tools/files.test.js` | **Create** | +40 | Sandbox positive/negative + truncation |
| `src/lib/asistente/__tests__/tools/registry.test.js` | **Create** | +30 | Register/execute/list + ToolNotFoundError |
| `src/components/asistente/ChatPanel.jsx` | Modify | +25 | `AbortController` wiring, lazy `useState` initializer, `ToolResult` import |
| `src/components/asistente/ToolResult.jsx` | No code change | 0 | Already exists; wired in by ChatPanel import |
| `src/components/asistente/__tests__/ChatPanel.test.jsx` | **Create** | +90 | send→loading→response, stop aborts, hydration stability |
| `src/app/api/terminal/session/[id]/capture/route.js` | **Create** | +40 | `GET` returns captured session output |
| `src/app/api/terminal/session/[id]/input/route.js` | **Create** | +40 | `PUT { data }` pushes input to session |
| `docs/prompts/asistente/zed-system-prompt.md` | **Create** | +80 | 10-tool prompt with params, call format, examples |
| **Total** | | **~730** | (within 800 cap) |

## File-by-file change detail

### `src/app/api/assistant/chat/route.js`

**Replace** the broken parser (lines 66-110) with the D1 snippet. **Add** tool registrations for `listTerminalsTool`, `reviewTerminalTool`, `executeInTerminalTool`, `reviewLogFileTool`, `closeTerminalTool` (5 new entries in the `registry.register(...)` block at line 124-129). **Replace** `buildZedSystemPrompt()` with the D7 `loadSystemPrompt()` call. **Replace** the literal `MAX_TURNS = 3` with the D6 expression. **Modify** the loop to push a structured tool-results message (parsed object, not stringified JSON) and to set `meta.max_turns_reached: true` when the loop exits because of the cap. **Modify** the catch block to include `upstream_status` when the thrown error carries one.

### `src/lib/asistente/tools/terminal.js`

Four new tool definitions, replacing the 3 stubs at lines 43-72 and adding `closeTerminalTool`:

- **`listTerminalsTool.execute`**: `GET ${baseUrl}/api/terminal/processes` → returns `{ processes: data.processes }`. No params.
- **`reviewTerminalTool.execute`**: requires `params.session_id`; else `{ error: 'missing required parameter: session_id' }`. Then `GET ${baseUrl}/api/terminal/session/${id}/capture` → returns `{ output, session_id }`.
- **`executeInTerminalTool.execute`**: requires `session_id` and `input` (note: param key is `input` per spec, even though it feels like a reserved word — model will produce it). Else `{ error: 'missing required parameter: <name>' }`. Then `PUT ${baseUrl}/api/terminal/session/${id}/input` with body `{ data: params.input }` → returns backend response.
- **`closeTerminalTool.execute`**: requires `session_id`; else error. If `params.confirm !== true`, return dry-run object. Else call `closeTerminalSessionById(params.session_id)` directly (imported from `@/lib/terminal/closeTerminalSession`) and return its result.

Also fix `openTerminalTool` to POST (not GET) to `/api/terminal/session` with body `{ command, program, cwd }` and pass `program` through (current bug: query string drops `program`).

### `src/lib/asistente/tools/browser.js`

Replace the `writeFileSync` block at lines 20-21 (orphan) with a no-op. Replace the URL check at line 16 with:
```js
let parsed
try { parsed = new URL(url) } catch { return { error: 'invalid url' } }
if (!['http:', 'https:'].includes(parsed.protocol)) {
  return { error: `unsupported scheme: ${parsed.protocol}` }
}
```
Then `execSync(`xdg-open "${parsed.toString()}"`)`.

### `src/lib/asistente/tools/files.js`

Add `resolveProjectRoot()` + `assertWithinRoot()` exports (D3 snippet). In `browseFilesTool.execute`:
- `list` action: call `assertWithinRoot(targetPath)`; if false, return `{ error: 'path outside project root' }`. Use `readdirSync(resolved, { withFileTypes: true })`.
- `read` action: call `assertWithinRoot(targetPath)`; if false, return same error. Resolve, check `statSync(resolved).isDirectory()` → return `{ error: 'path is a directory' }`. Else `readFileSync`, slice to 4096, count `content.split('\n').length`, return `{ content, line_count, path }`. ENOENT → `{ error: 'file not found' }`.

Apply the same `assertWithinRoot` guard at the top of `reviewLogFileTool.execute`.

### `src/components/asistente/ChatPanel.jsx`

- **Hydration fix (line 67)**: replace `timestamp: new Date().toISOString()` with a lazy initializer that returns the string `"initial"`. Real timestamps are added in `setMessages(...)` (line 86, 100, 107) — those run in event handlers, not render, so they're safe.
- **AbortController (lines 71, 89, 122-125)**: create the controller at the top of `handleSend` (`const ctrl = new AbortController()`), pass `{ signal: ctrl.signal }` to `fetch`, call `setAbortController(ctrl)`, and in `finally` call `setAbortController(null)`. `handleStop` already calls `abortController?.abort()` — just needs the controller to be wired.
- **ToolResult wiring**: import `ToolResult` at the top. Replace the inline `ToolBadge` mapping at lines 158-160 with `<ToolResult key={j} toolName={r.tool} result={r.result} />`. Delete the local `ToolBadge` definition (lines 27-63) — but keep the `devhub:zed-open-terminal` window-event dispatch somewhere; move it into a `useEffect` that fires on `open_terminal` results.

### `docs/prompts/asistente/zed-system-prompt.md`

80-line prompt with these sections, in this order:
1. **Header** — "You are Zed, a senior architect… match the user's language."
2. **Capabilities** — short paragraph listing each of the 10 tools.
3. **Call format** — explicit format with `TOOL: <name>` on its own line + `PARAM: <key>=<value>` lines. State: "Do not wrap in JSON or markdown fences."
4. **Tool reference** — one block per tool: name, description, required `PARAM:` keys, one worked example. Cover all 10.
5. **Rules** — no JSON, no fences, no repeated empty params, confirm-mode for `close_terminal`, dry-run for `browse_files` at `/etc/passwd`, etc.
6. **Examples** — 3 end-to-end examples (open terminal, list + close, browse files).

## Test strategy

Strict TDD: each task is **RED → GREEN → REFACTOR**, one commit per task. Test order follows dependency depth:

| Order | File | What it covers | Dependencies |
|------:|------|----------------|--------------|
| 1 | `src/lib/asistente/__tests__/parseToolCalls.test.js` | 10+ parser cases (multi-`=`, `://`, quoted, multi-line, empty value, no-tool input, two `TOOL:` blocks, trailing whitespace) | none |
| 2 | `src/lib/asistente/__tests__/tools/registry.test.js` | register/execute/list + ToolNotFoundError | none |
| 3 | `src/lib/asistente/__tests__/tools/files.test.js` | `resolveProjectRoot()` env vs cwd, `assertWithinRoot()` allow/deny, `browse_files` read truncation + line_count, escape rejection | `assertWithinRoot` |
| 4 | `src/lib/asistente/__tests__/tools/browser.test.js` | URL scheme allow-list (http/https OK, javascript/data/file/ftp rejected), malformed URL, no `/tmp/devhub-*` artifact created | `browserTool` |
| 5 | `src/lib/asistente/__tests__/tools/terminal.test.js` | listTerm/reviewTerm/executeTerm/closeTerm with mocked `fetch` + `closeTerminalSessionById`; `close_terminal` dry-run path | `terminalTool`, new HTTP routes |
| 6 | `src/app/api/assistant/chat/__tests__/route.test.js` | 200/400/500 paths, MAX_TURNS exits with `meta.max_turns_reached`, no-params feedback, MiniMax mocked at the module boundary | route.js |
| 7 | `src/components/asistente/__tests__/ChatPanel.test.jsx` | send → loading → response, stop mid-request resets `isLoading` within 100ms, `useState` initializer is stable across "renders" (call twice, get same sentinel), `ToolResult` renders for tool messages | `ChatPanel` |

Test infrastructure follows the repo's existing pattern (Jest 29, `tests/jest.runtime-compat.js` setup, `moduleNameMapper: '^@/(.*)$'`). For component tests, use JSDOM + `createRoot` + `flushSync` (see `tests/unit/operational-feedback-components.test.jsx`). Mock `fetch` globally for the integration test; mock `closeTerminalSessionById` via `jest.mock('@/lib/terminal/closeTerminalSession', ...)`.

Test command: `pnpm exec jest --runInBand tests/unit/asistente* src/lib/asistente src/components/asistente src/app/api/assistant`. Filter regex narrowed to avoid touching the 74 unrelated test files.

## Risks and Mitigations

| # | Risk | Likelihood | Mitigation (implementation detail) |
|---|------|------------|------------------------------------|
| 1 | **Parser regex misses an edge case the model produces** | Medium | 10+ parser unit tests in `parseToolCalls.test.js` (table-driven, one per scenario from the spec). Plus: integration test in route.js that feeds 3 real model outputs from the audit's smoke-test logs (stored as fixtures under `__tests__/fixtures/zed-model-outputs/`). |
| 2 | **Path sandbox breaks legit access** (e.g. model needs `node_modules/foo`) | Low | Allow-list project root + `${root}/.devhub/**` + `/tmp/devhub-*` from day 1. The audit's smoke tests confirm no legit access pattern was blocked. Plus: a `__tests__/tools/files.test.js` matrix that exercises positive (root, subpath, `.devhub/`, `/tmp/devhub-*`) and negative (`/etc/passwd`, `..` escape, `/tmp/some-other-tool/`) cases. |
| 3 | **Closing a real terminal kills a user session unexpectedly** | Medium | `close_terminal` requires explicit `confirm: true`. Dry-run object includes `session_id`, `action: 'would close'`, and a hint to call again with `confirm: true`. Test in `terminal.test.js` confirms no HTTP call on dry-run path. |
| 4 | **AbortController wired wrong → fetch hangs after Stop** | Low | Component test: render `ChatPanel`, send message that triggers a slow mocked fetch, click Stop, assert `isLoading=false` within 100ms and no further `setMessages` calls. Plus: integration test that the abort signal is passed to `fetch` (via `jest.mock('next/server')` or a wrapper). |
| 5 | **System prompt not found at boot** (new file, easy to forget) | Low | `loadSystemPrompt()` throws at module init. Integration test in route.js confirms the throw. The prompt file is created in the **first** task of the apply phase. |

## Rollback Plan

**Single revert of the PR commit on `feature/session-workspace-restore`.** The change is self-contained — no DB migrations, no env var additions, no dependency bumps.

**Most likely failure modes (in order of likelihood)**:

1. **Parser too strict → some model output gets dropped.** Detection: `parseToolCalls` returns `[]` for text the old parser would have produced calls for. Mitigation: add a `parseToolCalls` test with that exact fixture and widen the regex. The old behavior was "silently broken" so a stricter parser is strictly better than the status quo.
2. **Path sandbox blocks a tool the user expected to work.** Detection: chat returns `{ error: 'path outside project root' }` for a path the user knows is legit. Mitigation: extend the allow-list. Easiest: add `/home/matias/ArxonLabs` to the env-driven allow-list (env var `ZED_PATH_ALLOWLIST`).
3. **`close_terminal` confirm-mode breaks a flow that expected silent close.** Detection: the model can never call close without an extra round-trip. Mitigation: the spec intentionally requires confirm — but if a real workflow needs silent close, the right answer is a separate `force_close_terminal` tool (not a flag override on `close_terminal`).
4. **AbortController cancel triggers an unhandled rejection on the server side.** Detection: 500s in `/api/assistant/chat` logs right after a Stop click. Mitigation: the route's catch block already converts throws to JSON; the abort error from fetch will be caught and returned as `{ error: 'request aborted' }`. Add a test.
5. **System prompt externalization misses on the first deploy** (e.g. Tauri bundle doesn't include `docs/`). Detection: route 500s with the descriptive error from `loadSystemPrompt()`. Mitigation: bundle the prompt in the Tauri build via the existing `tauri.conf.json` resource list; or inline the prompt as a fallback when the file is missing (defer to a follow-up — strictly out of scope here).

## Out of scope (deferred)

- **F-07** Native Anthropic `tool_use` blocks — `zed-native-tools` change.
- **F-14** `delegation.js` → `agentLaunchCommand.shared.js` migration.
- **F-15** `swarmTool` table-missing vs no-active-mission differentiation.
- **F-17** `console.log` → `zedLog` in `TerminalWorkspacesManager`.
- **F-19** Auth / rate-limit on `/api/assistant/chat` — `zed-auth` change.
- **F-21–F-24** P3 cosmetic (badge close UX, capability hint, locale placeholder).
- **F-13 / F-18** `program` passthrough in `open_terminal` (kept for compat but no behavioral fix beyond what the spec requires — `open_terminal` will accept and forward `program` but the backend doesn't use it yet).

## Decisions deferred to apply phase

- **Where the `devhub:zed-open-terminal` window-event dispatch lives** (currently in `ToolBadge`; will move to a `useEffect` in `ChatPanel` keyed on the last `open_terminal` tool result). One-task decision during apply.
- **Whether `confirm` in `close_terminal` is a boolean strict-equal or a truthy check**. Spec says "explicit `confirm: true`" → strict-equal. Locked.
- **Whether `MAX_TURNS` override uses `ZED_MAX_TURNS` or `DEVHUB_ZED_MAX_TURNS`**. Pick `ZED_MAX_TURNS` (shorter, no collision risk). Locked.
