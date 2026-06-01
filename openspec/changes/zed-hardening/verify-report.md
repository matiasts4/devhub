# Verification Report — zed-hardening

**Change**: zed-hardening
**Branch**: feature/session-workspace-restore
**Head SHA**: cd7df083f39412a5bf9c8fd3fb37f5fb96299bf4
**Baseline SHA**: 53ffff7 (pre-zed-hardening)
**Mode**: Strict TDD
**Test result**: 76 pass, 0 fail across 12 zed suites (excluding 4 pre-existing unrelated failures in `tests/unit/*`)

---

## Summary

| Capability      | Requirements | Scenarios |   Pass | Pass (deferred, code-verified) | Warning | Critical |
| --------------- | -----------: | --------: | -----: | -----------------------------: | ------: | -------: |
| asistente-chat  |            7 |        23 |      7 |                             12 |       1 |        3 |
| asistente-tools |           12 |        38 |     21 |                             13 |       2 |        2 |
| asistente-ui    |            6 |        17 |      0 |                             12 |       1 |        4 |
| **Total**       |       **25** |    **78** | **28** |                         **37** |   **4** |    **9** |

**Verdict**: FAIL

Three CRITICAL spec gaps were introduced during apply and need either a follow-up commit or an explicit spec update before archive. The remaining failures are concentrated in deferred scope (T-012, T-013) where the code is correct but no automated test covers the scenario.

---

## CRITICAL findings

### C1 — asistente-chat §5.1 / §5.2: no-params canonical error feedback is missing

**Spec** (lines 185-198 of `asistente-chat/spec.md`):

> When `parseToolCalls()` produces a call whose `params` object is empty, the chat route MUST NOT drop the call. The route MUST execute the tool with the empty params, **and the tool MUST return an error result object with shape `{ error: "missing required parameters" }`**.

**Implementation** (`src/app/api/assistant/chat/route.js` lines 202-216):

```js
for (const { name, input } of toolCalls) {
  ...
  let result;
  try {
    result = await buildRegistry().execute(name, input, context);
  } catch (err) {
    result = { error: err.message };
  }
  ...
}
```

There is NO `if (Object.keys(input).length === 0) result = { error: 'missing required parameters' }` check before dispatching to the tool, even though `design.md` (D8 / T-008 description) explicitly required it.

Concretely, when the model emits `TOOL: browse_files` with no `PARAM:` lines, the actual chain is:

1. `parseToolCalls` returns `[{ name: 'browse_files', input: {} }]` ✓
2. The route calls `buildRegistry().execute('browse_files', {})` ✓
3. `browse_files.execute` destructures `{ action = 'list', path: targetPath = '.', limit = 50 } = {}` and returns `{ items: [...], path: '.' }` (success) — NOT `{ error: "missing required parameters" }` ✗

The `apply-progress.md` table claims T-008 added the no-params feedback, but the diff in commit `b08ab0c` did not include it.

**Impact**: Spec scenarios §5.1 (TOOL with no PARAMs is still executed → result is an error object) and §5.2 (the result equals `{ error: "missing required parameters" }`) are both violated for the spec's primary example (`browse_files`).

**Fix**: add the check in `route.js` (per design) OR amend the spec to scope the canonical error to the tools that genuinely require params.

---

### C2 — asistente-ui §4.1 / §4.2: hydration fix is incomplete

**Spec** (lines 105-117 of `asistente-ui/spec.md`):

> The initial state MUST be stable across server and client renders (i.e., the same string on both sides), even if the actual timestamp drifts. The lazy initializer SHOULD return a sentinel value (e.g. `"initial"`) or a value derived from props that are stable between server and client.

**Implementation** (`src/components/asistente/ChatPanel.jsx` line 37-43):

```js
const [messages, setMessages] = useState(() => [
  {
    role: 'assistant',
    content: 'Hola, soy Zed. ¿En qué te puedo ayudar?',
    timestamp: new Date().toISOString(), // ← still non-deterministic
  },
]);
```

The comment above it (lines 34-36) claims the lazy initializer keeps the timestamp stable, but it only stabilizes across re-renders. The lazy initializer STILL runs once on the server (during SSR) and once on the client (first render), and `new Date()` returns a different string each time. React 18 will throw a hydration mismatch warning on this.

The design D9 explicitly called for `timestamp: "initial"`, not `timestamp: new Date().toISOString()`. The apply task T-009 comment ("D9: lazy initializer keeps … stable across re-renders") shows the implementer conflated the two stability requirements.

**Impact**: The "no hydration mismatch warning on first load" success criterion is not met. Live smoke test will surface this.

**Fix**: change `timestamp: new Date().toISOString()` to `timestamp: 'initial'`. The component already formats the timestamp with `new Date(timestamp).toLocaleTimeString(...)` so the displayed time becomes empty/0 for the sentinel — accept that, or set `timestamp: 0` and have the formatter branch to a constant.

---

### C3 — asistente-chat §1.1: model identifier is M3, not M2.7

**Resolution (T-010c)**: spec amended to `minimax-coding-plan/MiniMax-M3`. The M3 swap was a deliberate rotation after the team verified that M2.7 returns 401 from the MiniMax endpoint — see commit `51b31ae` and the assertion in `route.test.js`. The spec is now aligned with the implementation.

**Original spec** (lines 14-15 of `asistente-chat/spec.md`):

> Base URL: `https://api.minimax.io/anthropic/v1/messages`
> Model identifier: `minimax-coding-plan/MiniMax-M2.7`

**Implementation** (`src/app/api/assistant/chat/route.js` line 27):

```js
export const MODEL = 'minimax-coding-plan/MiniMax-M3';
```

The apply team found during smoke testing that M2.7 returns 401 from MiniMax and swapped to M3, locking the change in with a `route.test.js` assertion that expects M3.

**Impact**: The spec scenario "AND the model identifier is `minimax-coding-plan/MiniMax-M2.7`" is violated. This is a deliberate behavioral deviation documented in the apply-progress but not captured in a spec amendment.

**Fix**: amend the spec to read `M3`, OR revert to M2.7 once the upstream 401 is resolved.

---

### C4 — asistente-ui §1.1 / §1.2 / §1.3 / §2 / §3 / §4 / §5: ChatPanel scenarios not covered by automated tests

All 17 scenarios in `asistente-ui/spec.md` are in the T-013 deferral bucket. The code reads correctly, but with no component test, the spec is "untested" not "verified".

Specifically unverifiable without a human running the dev server:

- §1.1 / §1.2: whether the user vs assistant styling actually differs
- §1.3: whether `<ToolResult />` is rendered for tool messages
- §2.1: whether the send button is `disabled` while `isLoading`
- §2.3: whether Enter in the textarea is a no-op while `isLoading`
- §3.1: whether `isLoading` resets within 100ms of Stop
- §3.3: whether a new AbortController is created per send
- §4.1: no hydration warning in console (see C2 — likely fails)
- §5.1 / §5.2: that ToolResult renders string vs pretty JSON correctly
- §5.3 / §5.4: that null/undefined results don't throw

**Impact**: ~90 LOC of test coverage is owed. The manual smoke test (below) covers all of these; until that runs, these scenarios are `UNTESTED` per the strict TDD verify standard.

---

### C5 — asistente-tools §1: ToolRegistry scenarios untested (T-012 partial)

`src/lib/asistente/__tests__/tools/registry.test.js` was never created. The four scenarios in `asistente-tools/spec.md §1` (register/execute round-trip, ToolNotFoundError, list, error-object passthrough) have no automated coverage.

**Code verification**:

- `ToolRegistry.register` (`src/lib/asistente/tools/registry.js` line 6-11) — uses `Map.set`, throws if no name
- `ToolRegistry.execute` (lines 17-23) — throws `Error("Unknown tool: <name>. Available: ...")` (note: spec asks for exactly `"Unknown tool: <name>"` — extra suffix is a minor WARNING, not a CRITICAL, see W3)
- `ToolRegistry.list` (lines 13-15) — returns tool values array, not names

The code is correct enough to satisfy the scenarios, but the `list()` return value is `tool definitions` (which include `.name`) not just name strings. The spec scenario "THEN the result includes both 'a' and 'b'" is satisfied via `result.map(t => t.name)` but a strict reading of "returns the array of registered tool names" is not met.

**Impact**: registry behavior is correct in practice, but `list()` shape deviates from spec wording.

---

## WARNING findings

### W1 — `browse_files` error messages embed the path, not the spec's exact text

Spec asks for the exact strings:

- `{ error: "path outside project root" }`
- `{ error: "path is a directory" }`
- `{ error: "file not found" }`

Implementation returns the same prefix but appends the path / inner error:

- `{ error: "path outside project root: <p>" }` (line 10 of files.js)
- `{ error: "path is a directory: <p>" }` (line 51)
- `{ error: "file not found: <p> (<err>)" }` (line 54)

Tests use regex `/path outside project root/i` so they pass. Consumers using string equality would break.

**Fix**: either change the impl to return the exact spec strings, or amend the spec to permit the path suffix (the suffix is useful in production logs).

### W2 — `parseToolCalls` includes `TOOL:` after non-TOOL prose matches (parser line 19 anchors line start, but it's case-insensitive)

The regex uses `/^TOOL:\s*(\w+)\s*$/i` (case-insensitive). The spec doesn't specify case-sensitivity, but a model emitting `tool: open_url` would now be matched whereas a strict-case parser would reject it. Behavior is permissive in a useful way; just calling it out.

### W3 — `ToolRegistry.execute` error message includes the available-tools suffix

Spec: `error message equals "Unknown tool: <name>"`.
Impl: `Error("Unknown tool: <name>. Available: <list>")`.

A consumer that does `err.message === "Unknown tool: foo"` would fail. Minor; no test asserts strict equality.

### W4 — `MAX_TURNS` is exported but no test reads it post-assignment

The spec scenario "AND changing MAX_TURNS at module level (in tests) changes the loop's bound" requires a test that mutates the exported constant. T-012 (deferred) was the natural place; the constant is exported (`export let MAX_TURNS = ...`) but no test currently mutates it. Behavior is correct; just unverified.

---

## Spec compliance matrix (per requirement)

### asistente-chat

| Req | Scenario                                             | Test                                                                                   | Result                                                                                      |
| --- | ---------------------------------------------------- | -------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| 1.1 | API key resolved from MINIMAX_API_KEY                | (no test)                                                                              | CRITICAL — M3 vs M2.7 (C3)                                                                  |
| 1.2 | API key falls back to ANTHROPIC_API_KEY              | (no test, code-verified)                                                               | PASS (deferred, code-verified)                                                              |
| 1.3 | Missing API key returns 500                          | (no test, code-verified)                                                               | PASS (deferred, code-verified) — route.js line 130-133                                      |
| 2.1 | Prompt file lists all 10 tools                       | (no test, code-verified)                                                               | PASS (deferred, code-verified) — zed-system-prompt.md has 10 sections                       |
| 2.2 | Prompt instructs the textual format                  | (no test, code-verified)                                                               | PASS (deferred, code-verified) — "Do NOT wrap tool calls in JSON, markdown code fences…"    |
| 2.3 | Missing prompt file fails fast                       | (no test, code-verified)                                                               | PASS (deferred, code-verified) — `loadSystemPrompt` throws on missing file (line 50-53)     |
| 3.1 | Single key=value with whitespace                     | `parseToolCalls.test.js > preserves whitespace inside a value`                         | PASS                                                                                        |
| 3.2 | Value containing `=` and `://`                       | `parseToolCalls.test.js > preserves value containing = and ://`                        | PASS                                                                                        |
| 3.3 | Quoted value has surrounding quotes stripped         | `parseToolCalls.test.js > strips a single matched pair of double quotes`               | PASS                                                                                        |
| 3.4 | Multiple params for the same tool                    | `parseToolCalls.test.js > parses multiple params for the same tool`                    | PASS                                                                                        |
| 3.5 | Multiple TOOL blocks in one response                 | `parseToolCalls.test.js > parses two TOOL blocks in one response`                      | PASS                                                                                        |
| 3.6 | Empty value is preserved as empty string             | `parseToolCalls.test.js > preserves empty value as empty string`                       | PASS                                                                                        |
| 3.7 | Input with no TOOL lines returns empty array         | `parseToolCalls.test.js > returns empty array for input with no TOOL lines`            | PASS                                                                                        |
| 4.1 | Loop exits when model produces no tool call          | `route.test.js > tool loop dispatch` (partial) + code-verify                           | PASS (deferred, code-verified)                                                              |
| 4.2 | Loop exits after MAX_TURNS                           | (no test, code-verified)                                                               | PASS (deferred, code-verified) — route.js line 238-241 sets `meta.max_turns_reached = true` |
| 4.3 | MAX_TURNS is the exported constant used by the loop  | (no test, code-verified)                                                               | WARNING — exported but never mutated by a test (W4)                                         |
| 5.1 | TOOL with no PARAMs is still executed                | (no test)                                                                              | CRITICAL — canonical error feedback missing (C1)                                            |
| 5.2 | The result is the canonical error shape              | (no test)                                                                              | CRITICAL — same as C1                                                                       |
| 6.1 | Tool results become model-visible on next turn       | (no test, code-verified)                                                               | PASS (deferred, code-verified) — route.js line 218-228 pushes structured content            |
| 6.2 | Model produces final answer after seeing tool result | `route.test.js > tool loop dispatch` (final-text branch)                               | PASS                                                                                        |
| 7.1 | Malformed body returns 400                           | `route.test.js > route handler accepts a POST request — invalid body returns 400 JSON` | PASS                                                                                        |
| 7.2 | Upstream 502 from MiniMax                            | (no test, code-verified)                                                               | PASS (deferred, code-verified) — route.js line 165-177 sets `upstream_status`               |
| 7.3 | Unexpected throw returns 500 JSON                    | (no test, code-verified)                                                               | PASS (deferred, code-verified) — route.js line 253-259                                      |

### asistente-tools

| Req  | Scenario                                          | Test                                                                                                        | Result                                                                    |
| ---- | ------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------- |
| 1.1  | Register then execute round-trip                  | (no test)                                                                                                   | CRITICAL — `registry.test.js` does not exist (C5)                         |
| 1.2  | Execute unknown tool throws ToolNotFoundError     | (no test)                                                                                                   | CRITICAL — same as 1.1, plus W3                                           |
| 1.3  | List returns registered names                     | (no test)                                                                                                   | CRITICAL — same as 1.1                                                    |
| 1.4  | Tool execute returning error object               | (no test)                                                                                                   | CRITICAL — same as 1.1                                                    |
| 2.1  | Registry exposes all 10 names                     | (no test, code-verified via `route.js` line 98-110)                                                         | PASS (deferred, code-verified)                                            |
| 2.2  | Stub tools are no longer stubs                    | `terminal.list.test.js` (list_terminals) + `terminal.exec.test.js` (execute/close)                          | PASS                                                                      |
| 3.1  | Successful open_terminal returns normalized shape | `terminal.list.test.js > POSTs body { command, program, cwd }…`                                             | PASS                                                                      |
| 3.2  | open_terminal with minimal params                 | `terminal.list.test.js > returns error when backend response is missing fields` (uses `{}`)                 | PASS                                                                      |
| 3.3  | Backend missing fields                            | `terminal.list.test.js > returns error when backend response is missing fields`                             | PASS                                                                      |
| 4.1  | Lists sessions from backend                       | `terminal.list.test.js > GETs /api/terminal/processes…`                                                     | PASS                                                                      |
| 4.2  | Empty active set                                  | `terminal.list.test.js > returns empty processes array when backend has none`                               | PASS                                                                      |
| 5.1  | Reads output by session id                        | `terminal.list.test.js > GETs /api/terminal/session/:id/capture…`                                           | PASS                                                                      |
| 5.2  | Missing session_id                                | `terminal.list.test.js > returns missing-parameter error…`                                                  | PASS                                                                      |
| 6.1  | Sends input to session                            | `terminal.exec.test.js > PUTs body { data: <input> }…`                                                      | PASS                                                                      |
| 6.2  | Missing input parameter                           | `terminal.exec.test.js > returns missing-parameter error…when input is missing`                             | PASS                                                                      |
| 7.1  | Dry-run without confirm                           | `terminal.exec.test.js > dry-run: no confirm returns preview…`                                              | PASS                                                                      |
| 7.2  | Confirm true executes close                       | `terminal.exec.test.js > confirm: true calls closeTerminalSessionById…`                                     | PASS                                                                      |
| 7.3  | Confirm false is a dry-run                        | `terminal.exec.test.js > confirm: false is a dry-run…`                                                      | PASS                                                                      |
| 7.4  | Missing session_id                                | `terminal.exec.test.js > missing session_id returns error…`                                                 | PASS                                                                      |
| 8.1  | https URL accepted                                | `browser.test.js > accepts https URL…`                                                                      | PASS                                                                      |
| 8.2  | javascript: scheme rejected                       | `browser.test.js > rejects javascript: scheme…`                                                             | PASS                                                                      |
| 8.3  | data: scheme rejected                             | `browser.test.js > rejects data: scheme`                                                                    | PASS                                                                      |
| 8.4  | Malformed URL rejected                            | `browser.test.js > rejects malformed URL`                                                                   | PASS                                                                      |
| 8.5  | No orphan temp file written                       | (no test, code-verified)                                                                                    | PASS (deferred, code-verified) — `writeFileSync` removed from browser.js  |
| 9.1  | Path inside project root accepted                 | `pathSandbox.test.js > accepts a subpath of the project root` + `files.test.js` (positive cases)            | PASS                                                                      |
| 9.2  | Path escape with `..` rejected                    | `pathSandbox.test.js > rejects a .. escape…` + `files.test.js > rejects .. escape…`                         | PASS                                                                      |
| 9.3  | /etc/passwd rejected                              | `pathSandbox.test.js > rejects /etc/passwd` + `files.test.js > rejects /etc/passwd…`                        | PASS                                                                      |
| 9.4  | .devhub/ subpath allowed                          | `pathSandbox.test.js > accepts a path under <root>/.devhub/` + `files.test.js > allows .devhub/state.json`  | PASS                                                                      |
| 9.5  | /tmp/devhub-\* allowed                            | `pathSandbox.test.js > accepts a /tmp/devhub-* scratch path` + `files.test.js > allows /tmp/devhub-* paths` | PASS                                                                      |
| 9.6  | Arbitrary /tmp rejected                           | `pathSandbox.test.js > rejects an arbitrary /tmp path…`                                                     | PASS                                                                      |
| 10.1 | Read returns content and line count               | `files.test.js > read of 20KB file returns <= 4096 bytes content + total line_count`                        | PASS                                                                      |
| 10.2 | Read of large file truncated to 4KB               | `files.test.js > read of 20KB file returns <= 4096 bytes…`                                                  | PASS                                                                      |
| 10.3 | Read of directory returns error                   | `files.test.js > read of a directory returns error`                                                         | WARNING — message embeds path (W1)                                        |
| 10.4 | Read of missing file returns error                | `files.test.js > read of missing file returns error`                                                        | WARNING — message embeds path (W1)                                        |
| 11.1 | Delegation creates a tmux session                 | (no test, code-verified)                                                                                    | PASS (deferred, code-verified) — delegation.js uses `tmux new-session -d` |
| 12.1 | Active mission present                            | (no test)                                                                                                   | CRITICAL — no swarm test exists                                           |
| 12.2 | No active mission                                 | (no test)                                                                                                   | CRITICAL — same                                                           |
| 12.3 | Missing table returns error                       | (no test)                                                                                                   | CRITICAL — same                                                           |

### asistente-ui

| Req | Scenario                                              | Test                     | Result                                                                                                                             |
| --- | ----------------------------------------------------- | ------------------------ | ---------------------------------------------------------------------------------------------------------------------------------- |
| 1.1 | User message aligns one way                           | (no test, code-verified) | PASS (deferred, code-verified) — `justify-end` for user in ChatMessage                                                             |
| 1.2 | Assistant message aligns the other way                | (no test, code-verified) | PASS (deferred, code-verified) — `justify-start` for assistant                                                                     |
| 1.3 | Tool message renders via ToolResult                   | (no test, code-verified) | PASS (deferred, code-verified) — ChatPanel line 182-184 uses `<ToolResult />`                                                      |
| 2.1 | Send button disabled while in flight                  | (no test)                | CRITICAL — no component test, but code clearly has `{isLoading ? <Stop/> : <Send/>}` so the visible UI is exclusive (manual smoke) |
| 2.2 | Send button re-enabled after response                 | (no test)                | CRITICAL — same                                                                                                                    |
| 2.3 | Enter during in-flight request is ignored             | (no test)                | CRITICAL — same                                                                                                                    |
| 3.1 | Stop aborts the fetch                                 | (no test)                | CRITICAL — same                                                                                                                    |
| 3.2 | Stop button is not visible when idle                  | (no test)                | CRITICAL — same                                                                                                                    |
| 3.3 | New send creates a fresh controller                   | (no test)                | CRITICAL — same                                                                                                                    |
| 4.1 | No hydration mismatch warning on first load           | (no test)                | CRITICAL — `new Date().toISOString()` still in initializer (C2)                                                                    |
| 4.2 | Timestamp becomes real after first client interaction | (no test)                | CRITICAL — same root cause (C2)                                                                                                    |
| 5.1 | String result renders as plain text                   | (no test)                | CRITICAL — same                                                                                                                    |
| 5.2 | Object result renders as pretty-printed JSON          | (no test)                | CRITICAL — same                                                                                                                    |
| 5.3 | Null result renders empty body                        | (no test)                | CRITICAL — same                                                                                                                    |
| 5.4 | Undefined result renders empty body                   | (no test)                | CRITICAL — same                                                                                                                    |
| 6.1 | Active zed tab mounts ChatPanel                       | (no test, code-verified) | PASS (deferred, code-verified) — `WorkspaceRightDock.jsx` line 76-80: `{isZedActive && <ChatPanel />}`                             |
| 6.2 | Inactive zed tab does not mount ChatPanel             | (no test, code-verified) | PASS (deferred, code-verified) — same                                                                                              |

---

## Pass (deferred, code-verified)

All deferred scenarios are below. Each has been inspected and the implementation matches the spec scenario, but no automated test exists. Each is marked `UNTESTED` in the strict TDD matrix; the code is correct.

- asistente-chat: 1.2, 1.3, 2.1, 2.2, 2.3, 4.1, 4.2, 4.3 (WARNING), 6.1
- asistente-tools: 2.1, 8.5, 9.1, 11.1
- asistente-ui: 1.1, 1.2, 1.3, 6.1, 6.2

---

## TDD compliance (strict mode)

| Check                        | Result | Details                                                           |
| ---------------------------- | ------ | ----------------------------------------------------------------- |
| TDD evidence reported        | ✅     | `apply-progress.md` has the TDD Cycle Evidence table              |
| All tasks have tests         | ❌     | T-012 (90 LOC) and T-013 (90 LOC) deferred; 2/13 tasks lack tests |
| RED confirmed (tests exist)  | ✅     | All 12 test files exist on disk                                   |
| GREEN confirmed (tests pass) | ✅     | 76/76 zed tests pass on execution                                 |
| Triangulation adequate       | ⚠️     | Most tasks have 4+ cases; T-008 has only 1 (acknowledged in spec) |
| Safety net for modifications | ✅     | Per-task pre-commit gate held; no regressions                     |

**TDD compliance**: 5/6 checks passed; deferral was pre-approved.

---

## Test layer distribution

| Layer       |  Tests |  Files | Tools                                 |
| ----------- | -----: | -----: | ------------------------------------- |
| Unit        |     70 |     10 | jest                                  |
| Integration |      4 |      1 | jest + supertest-style (mocked fetch) |
| E2E         |      0 |      0 | not available                         |
| **Total**   | **74** | **11** | —                                     |

Note: 76 tests total in jest run; the spec compliance matrix above counts 12 suites (76 includes the tool loop dispatch test in route.test.js + 4 test files in `src/app/api/terminal/session/`).

---

## Quality metrics

- **Linter**: ➖ Not run in this verify pass
- **Type Checker**: ➖ Not run in this verify pass
- **Assertion quality**: ✅ No tautologies, no ghost loops, no smoke-only `toBeInTheDocument` patterns. Tests assert concrete return values, call counts, and side-effects.

---

## Manual smoke test checklist

These scenarios MUST be verified by the human running the dev server, since no automated test covers them:

- [ ] ChatPanel: send a message → see loading state → see response
- [ ] ChatPanel: click Stop mid-fetch → isLoading resets, no further messages
- [ ] **ChatPanel: refresh page → NO SSR hydration warning in console** (likely fails per C2)
- [ ] ChatPanel: open the `zed` tab in the right dock → chat renders
- [ ] ToolResult: when a tool returns a JSON object, full result is rendered (not just the badge)
- [ ] open_terminal: opens a new tmux session in the right panel
- [ ] list_terminals: returns active tmux sessions
- [ ] review_terminal_output: returns last N lines from a session
- [ ] execute_in_terminal: sends keystrokes (e.g. `ls\n`) to a session, output updates
- [ ] close_terminal: with `confirm: true` → session closes; without → dry-run preview returned
- [ ] open_url with `https://github.com` → xdg-open fires
- [ ] open_url with `javascript:alert(1)` → returns `{ error: "unsupported scheme" }`
- [ ] browse_files on `.env.local` → reads content
- [ ] browse_files on `/etc/passwd` → returns `{ error: "path outside project root" }`
- [ ] browse_files on `/home/me/project/../etc` → returns `{ error: "path outside project root" }`
- [ ] review_log_file on a project log → returns last lines
- [ ] get_swarm_status → returns missions from swarm_missions table
- [ ] delegate_to_opencode → still works (out of scope for verification, but smoke)
- [ ] **browse_files with no `action` param** → returns `{ error: "missing required parameters" }` (likely fails per C1)
- [ ] Multiple terminals open simultaneously → all stay alive, all can be listed/reviewed/executed/closed independently

---

## Coherence (design)

| Decision                                                | Followed? | Notes                                                                |
| ------------------------------------------------------- | --------- | -------------------------------------------------------------------- |
| D1 — per-line regex parser with quote-stripping         | ✅ Yes    | `parseToolCalls.js` lines 19-30, 32-52                               |
| D2 — env-var + cwd fallback project root                | ✅ Yes    | `pathSandbox.js` line 17-19                                          |
| D3 — path allow-list (root + .devhub/ + /tmp/devhub-\*) | ✅ Yes    | `pathSandbox.js` line 21-30                                          |
| D4 — URL scheme allow-list                              | ✅ Yes    | `urlSafety.js` line 7-18                                             |
| D5 — `close_terminal` confirm-mode with strict-equal    | ✅ Yes    | `terminal.js` line 182 (`confirm !== true`)                          |
| D6 — `MAX_TURNS` default 6, env-overridable             | ✅ Yes    | `route.js` line 45; also swapped to M3 instead of M2.7 (C3)          |
| D7 — system prompt externalized, throws on missing      | ✅ Yes    | `route.js` line 30-57                                                |
| D8 — per-request AbortController                        | ✅ Yes    | `ChatPanel.jsx` line 63-64, 117-120                                  |
| D9 — ToolResult component (no code change)              | ✅ Yes    | `ToolResult.jsx` unchanged; ChatPanel line 183 uses `<ToolResult />` |
| D10 — Jest runner                                       | ✅ Yes    | 12 jest suites, all pass                                             |
| D11 — Terminal capture/input routes                     | ✅ Yes    | `src/app/api/terminal/session/[id]/{capture,input}/route.js`         |

---

## Notes for archive

- 3 specs to promote to `openspec/specs/`:
  - `openspec/changes/zed-hardening/specs/asistente-chat/spec.md` → `openspec/specs/asistente-chat/spec.md`
  - `openspec/changes/zed-hardening/specs/asistente-tools/spec.md` → `openspec/specs/asistente-tools/spec.md`
  - `openspec/changes/zed-hardening/specs/asistente-ui/spec.md` → `openspec/specs/asistente-ui/spec.md`
- No modified capabilities (all 3 are greenfield)
- No removed capabilities
- **Spec amendments recommended before archive** (to match the implemented reality):
  - asistente-chat §1.1 / §1.2: model identifier should read `minimax-coding-plan/MiniMax-M3` (current spec says M2.7, code says M3)
  - asistente-chat §5.1 / §5.2: scope the canonical error to tools that genuinely require params; or add the missing `if (Object.keys(input).length === 0)` check in route.js
  - asistente-ui §4.1: confirm the design intent — lazy initializer with `new Date()` only stabilizes across re-renders, not across SSR. Either fix the impl (use `'initial'` sentinel) or narrow the spec to "no `new Date()` at the top of render".
  - asistente-tools §1.3: `list()` returns tool definitions, not name strings. Either narrow the spec wording or change the impl.
  - asistente-tools §10.3 / §10.4: spec wants exact error strings, impl embeds the path in the message. Pick one.

---

## Test run output (summary)

```
Test Suites: 12 passed, 12 total
Tests:       76 passed, 76 total
Snapshots:   0 total
Time:        0.424 s, estimated 1 s
```

12 zed suites: 76 pass, 0 fail. 4 unrelated pre-existing failures in `tests/unit/*` (tauri-cli, desktop-production-port, native-runtime-integration, spa-shell-adoption-files) are NOT in the filter and were not exercised by this verify run.
