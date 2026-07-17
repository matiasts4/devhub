# Tasks: native-tui-prompt-paste

## Review Workload Forecast

- Estimated changed lines: ~450–550 including tests (borderline)
- 400-line budget risk: **Medium-High**
- Chained PRs recommended: **Yes** if implementation + tests exceed 400 net
- Decision needed before apply: delivery_strategy is `auto-forecast` → if over budget, implement as **chained slices** without asking

### Suggested chain (if needed)

1. **PR1** — pure coordinator + registry + unit tests (no UI wire)
2. **PR2** — tools + dispatch contract + tests
3. **PR3** — TerminalTTY / workspace wire + integration-style unit tests

If total stays under ~400, single PR is fine.

---

## Tasks

### T1 — Pure coordinator module (TDD)

- [ ] Add `src/lib/asistente/nativeTuiBootstrapPaste.js` with:
  - `DEFAULT_BOOTSTRAP_TIMEOUT_MS = 15000`
  - `BOOTSTRAP_ENTER` (CR)
  - `isBootstrapReady({ program, signals })`
  - `normalizeBootstrapText(text)` (trim; strip trailing newlines — Enter is separate)
  - `runNativeTuiBootstrapPaste({...})`
- [ ] Add `src/lib/asistente/__tests__/nativeTuiBootstrapPaste.test.js`:
  - ready → format + send paste + send enter
  - timeout → no send + timeout status
  - empty text → skipped
  - multiline path calls formatFn (assert markers if formatFn is real helper)
- [ ] Verify tests pass

### T2 — Pending bootstrap registry (TDD)

- [ ] Add `src/lib/asistente/nativeTuiBootstrapRegistry.js` (reserve / consume / markDone / isDone / clear for tests)
- [ ] Unit tests for reserve→consume once, markDone idempotency, unknown id

### T3 — Dispatch forwards bootstrap_input (TDD)

- [ ] Update `dispatchZedOpenTerminalFromToolResults` to pass `bootstrap_input` (and optional timeout)
- [ ] Adjust dedup key to include bootstrap presence/hash when needed
- [ ] Extend `dispatchZedActions.test.js`

### T4 — Tool + intent producers (TDD)

- [ ] `open_terminal`: accept `prompt` and/or `bootstrap_input`; for agent programs force interactive launch; set `bootstrap_input` from prompt
- [ ] `launch_agent_session`: all agents interactive + `bootstrap_input` from prompt (not Grok-only)
- [ ] `zedIntentRouter` merge: set `bootstrap_input` for all agent programs when prompt present
- [ ] Update `agentLauncherTools.test.js`, terminal tool tests, intent router tests if present

### T5 — Wire open-terminal → registry → panel

- [ ] `useZedWorkspaceEvents` / open handler: on open with `bootstrap_input`, `reserve(panelId, …)`
- [ ] Ensure `terminalId` from tool result matches panel id used by TerminalTTY

### T6 — Wire TerminalTTY / session lifecycle

- [ ] On panel session ready path, start coordinator with signals from existing refs
- [ ] Use `formatTerminalPastePayload` + `sendTerminalPasteInput` for real socket
- [ ] `markDone` on success; log timeout via existing debug logger
- [ ] Guard against double start

### T7 — Verify + polish

- [ ] Run focused Jest suites for touched files
- [ ] Confirm no `--prompt` in agent bootstrap tool results for happy path
- [ ] Short note in apply-progress / verify readiness for manual Grok smoke if available

## Definition of done

- Spec scenarios T1–T6 covered by tests or explicit verify notes
- No product dependency on CLI prompt injection for Zed agent open + task
- `bootstrap_input` consumed end-to-end in client
