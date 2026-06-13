# Tasks: terminal-tui-interaction

**Branch:** `feature/terminal-renderer-xterm-webgl`
**Source of truth:** `openspec/changes/terminal-tui-interaction/{proposal,spec,exploration,design}.md`
**Pace:** auto · **PRs:** auto · **Review window:** 400–800 lines
**Chained PR position:** SECOND (after `terminal-display-names` lands first)
**Convention:** every task is RED-first (jest test added in the same commit, GREEN follows), each task is a single atomic commit or ≤2 commits. TDD per NFR-T07.

**Commit message convention:** `feat(terminal): ...` for new behavior, `fix(terminal): ...` for bug fixes, `test(terminal): ...` for tests-only commits, `chore(terminal): ...` for tooling.

---

## Task T1: filter accepts sessionContext, forwards SGR click when TUI is ready

### Goal
Replace `_session` (unused) with a real `SessionContext` argument. When `mode === 'tui' && tuiReady === true && panelHidden !== true`, the filter returns the SGR click chunk unchanged. When `ctx == null` or `mode === 'shell'`, behavior matches today (strip click leaks). Backward compat preserved.

### Test
- **File:** `src/lib/terminal/terminalNoiseFilter.test.js`
- **Describe (new):** `filterTerminalInputForSession — sessionContext gate`
- **Tests:**
  - `forwards SGR press when ctx.mode='tui' and ctx.tuiReady=true`
  - `strips SGR press when ctx.mode='tui' and ctx.tuiReady=false`
  - `strips SGR press when ctx.mode='shell'`
  - `strips SGR press when ctx.panelHidden=true even if tuiReady=true`
  - `preserves null/undefined ctx as legacy behavior (strips)`
  - `preserves wheel 64/65 in all ctx shapes (regression)`

### Files
- `src/lib/terminal/terminalNoiseFilter.js` — **modify** (replace `_session` → `ctx`, add branch in `stripTerminalInputNoise`)
- `src/lib/terminal/terminalNoiseFilter.test.js` — **modify** (add describe block)

### Commit
- `test(terminal): add sessionContext gate cases to filterTerminalInputForSession` (RED)
- `feat(terminal): filter forwards SGR click when sessionContext.tuiReady=true` (GREEN)

### Depends on
None.

### LOC estimate
~25 impl + ~50 tests = ~75 net.

### Out of scope
- TUI adapter registry (T4) — `tuiAdapter` is consulted by the call site, not the filter itself.
- Wiring `buildTerminalMousePressSequence` (T5) — separate concern.
- Sidecar parity test (T3) — this is the ESM-side change; parity is its own task.

---

## Task T2: wheel 64/65 regression — never stripped regardless of ctx

### Goal
Pin the wheel-preservation contract. The TUI scroll chain (FR-T01, NFR-T03) depends on the filter never stripping button 64/65. The test asserts this for every sessionContext shape — `null`, `shell`, `tui`+`tuiReady=false`, `tui`+`tuiReady=true`.

### Test
- **File:** `src/lib/terminal/terminalNoiseFilter.test.js`
- **Describe (new):** `filterTerminalInputForSession — wheel regression (NFR-T03)`
- **Tests:**
  - `forwards wheel 64 when ctx is null`
  - `forwards wheel 65 when ctx is null`
  - `forwards wheel 64 when ctx.mode='shell'`
  - `forwards wheel 64 when ctx.mode='tui' and tuiReady=false (bootstrap)`
  - `forwards wheel 64 when ctx.mode='tui' and tuiReady=true`
  - `click-then-scroll combined sequence preserved` (NFR-T03 combined guard)

### Files
- `src/lib/terminal/terminalNoiseFilter.test.js` — **modify** (add describe block)

### Commit
- `test(terminal): pin wheel 64/65 preservation across all sessionContext shapes`

### Depends on
T1.

### LOC estimate
~40 tests only = ~40 net.

### Out of scope
- Adapter-driven wheel strategy (T4).
- The `shouldPassthroughNativeTuiWheel` refactor (T4).

---

## Task T3: sidecar parity test + build-time CJS generation

### Goal
Eliminate the documented drift risk between `sidecar-backend/sessionTransport.js:132` (CJS) and `src/lib/terminal/terminalNoiseFilter.js` (ESM). The new strategy is **build-time CJS generation** — a tiny Node script writes `sidecar-backend/terminalNoiseFilter.generated.cjs` whose body is the literal ESM source + a `module.exports` block. The parity test loads both, asserts regex `source` byte-identity, and exercises a 15-input corpus.

### Test
- **File:** `tests/integration/sidecar-noise-filter-parity.test.js`
- **Describe:** `NFR-T02 — sidecar noise filter parity`
- **Tests:**
  - CJS generated artifact exists and `cjsMtime >= esmMtime`
  - regex `source` strings are byte-identical for `SHELL_TERMINAL_RESPONSE_RE`, `TERMINAL_MOUSE_CLICK_LEAK_RE`, `TERMINAL_FOCUS_REPORTING_RE`, `TERMINAL_WINDOW_REPORT_RE`
  - `filterTerminalInputForSession` returns identical results across the 15-input corpus (SGR press/release, wheel 64/65, focus in/out, DA1/DA2/DSR/CPR, window-size, DECRQM, DECRPM, plain text, click-then-scroll combined)
  - `sessionTransport.js` requires the generated CJS (not a hand-maintained copy)

### Files
- `scripts/build-noise-filter-cjs.js` — **new** (one-file build script)
- `sidecar-backend/terminalNoiseFilter.generated.cjs` — **new** (build artifact, gitignored OR committed; the parity test enforces mtime)
- `sidecar-backend/sessionTransport.js` — **modify** (replace hand-maintained regex blocks with `require('./terminalNoiseFilter.generated.cjs')`)
- `tests/integration/sidecar-noise-filter-parity.test.js` — **new**
- `package.json` — **modify** (add `pretest` hook to regenerate the CJS artifact)

### Commit
- `test(terminal): add sidecar noise filter parity test (NFR-T02)` (RED)
- `chore(terminal): generate sidecar CJS filter at pretest; switch sessionTransport to require it` (GREEN + cleanup)

### Depends on
T1.

### LOC estimate
~25 build script + ~70 parity test + ~20 sessionTransport cleanup = ~115 net.

### Out of scope
- The build pipeline (no esbuild/babel) — the CJS body is literal text from the ESM source.
- A CI workflow change — `pretest` is the gating mechanism; the existing CI runs `npm test`.

---

## Task T4: `tuiAdapter.js` registry + 4 describe test blocks

### Goal
Per FR-T08: a small, pure registry that exposes `{ detectReady, wheelStrategy, clickStrategy, focusStrategy }` for `opencode`, `grok`, and `plain` (safe fallback for unknown). Refactor `shouldPassthroughNativeTuiWheel` at `TerminalTTY.jsx:4383` to a thin wrapper around `getTuiAdapter(program).wheelStrategy` — call site stays stable.

### Test
- **File:** `src/lib/terminal/tuiAdapter.test.js`
- **Describe (4):** `tuiAdapter registry`, `opencode adapter strategies`, `grok adapter strategies`, `plain shell adapter strategies` (+ optional 5th: `legacy shouldPassthroughNativeTuiWheel wrapper`).
- **Tests:** see `design.md` §2.2 for the full block.

### Files
- `src/lib/terminal/tuiAdapter.js` — **new**
- `src/lib/terminal/tuiAdapter.test.js` — **new**
- `src/components/TerminalTTY.jsx` — **modify** (refactor `shouldPassthroughNativeTuiWheel` at line ~4383 to a thin wrapper; call site stable)

### Commit
- `test(terminal): add tuiAdapter registry test blocks` (RED)
- `feat(terminal): introduce tuiAdapter registry with opencode/grok/plain strategies` (GREEN)

### Depends on
T1 (so the adapter's `clickStrategy.passThrough` is meaningful for the next task).

### LOC estimate
~60 impl + ~80 tests + ~10 wrapper refactor = ~150 net.

### Out of scope
- Wiring the adapter into the `onData` filter call site (that is T5).
- The migration of `getTuiAdapter` callers outside `TerminalTTY.jsx`.

---

## Task T5: wire `buildTerminalMousePressSequence` + `sessionContext` in `onData`

### Goal
Two changes inside `TerminalTTY.jsx`:
1. At line 3844 (the `terminal.onData` callback), build a real `sessionContext` from the existing refs (`tuiSessionActiveRef`, `tuiSessionFooterConfirmedRef`, `isGrokSessionRef`, `panelHiddenRef`) and pass it to `filterTerminalInputForSession`.
2. At line ~4280 (inside `handleViewportMouseDown`), emit `buildTerminalMousePressSequence(cell.col, cell.row)` to the PTY when the active TUI is ready and the click landed in the transcript zone. This is the belt-and-suspenders fallback for TUIs that did not register `?1006h`.

The active-panel `onData` path is the primary forwarder; the viewport mousedown is the fallback.

### Test
- **File:** `src/components/__tests__/TerminalTTY.test.js`
- **Describe (new):** `TerminalTTY sessionContext and viewport mouse wiring`
- **Tests:**
  - `onData forwards SGR press when tuiReady=true` (active panel)
  - `onData strips SGR press when tuiReady=false (bootstrap)` (regression)
  - `onData strips SGR press when mode='shell'` (regression)
  - `handleViewportMouseDown emits buildTerminalMousePressSequence on the PTY when tuiReady=true and click in transcript`
  - `handleViewportMouseDown does NOT emit when tuiReady=false`
  - `buildTerminalMousePressSequence output matches the expected enable/SGR/disable burst`

### Files
- `src/components/TerminalTTY.jsx` — **modify** (line 3844-3854 + line 4246-4290)
- `src/components/__tests__/TerminalTTY.test.js` — **modify** (add describe block)

### Commit
- `test(terminal): pin sessionContext wiring in onData and viewport mousedown fallback`
- `feat(terminal): wire sessionContext into onData; emit buildTerminalMousePressSequence on viewport click`

### Depends on
T1, T4.

### LOC estimate
~30 impl + ~50 tests = ~80 net.

### Out of scope
- Glyph corruption test (T7).
- Sidecar parity (T3) — the call site in the sidecar does not change in this task.

---

## Task T6: `renderer_demoted` telemetry hook

### Goal
Per NFR-T06: emit a single `devhub:renderer_demoted` `CustomEvent` on the `window` when the WebGL demotion path runs. Hook site: `handleWebglContextLoss` at `src/components/TerminalTTY.jsx:2306-2333`. Emit only on the `pendingWebglRecoveryRef.current = true` branch (line 2322). Re-promotion at line 2293 does not emit.

### Test
- **File:** `src/components/__tests__/TerminalTTY.test.js`
- **Describe (new):** `TerminalTTY telemetry — renderer_demoted`
- **Tests:**
  - `dispatches devhub:renderer_demoted exactly once on context loss`
  - `event detail includes { panelId, from, to, at, reason }`
  - `does NOT dispatch on re-promotion (webglcontextrestored)`
  - `does NOT dispatch on normal initialization`

### Files
- `src/components/TerminalTTY.jsx` — **modify** (insert dispatch after line 2322)
- `src/components/__tests__/TerminalTTY.test.js` — **modify** (add describe block)

### Commit
- `test(terminal): add renderer_demoted telemetry test`
- `feat(terminal): emit devhub:renderer_demoted on WebGL context loss demotion`

### Depends on
T5 (so the test harness can mount the component with the wired refs).

### LOC estimate
~15 impl + ~30 tests = ~45 net.

### Out of scope
- Backend telemetry forwarding (the `CustomEvent` is browser-side; future PRs may mirror it to a backend channel).
- The one-way `webgl → canvas2d → dom` demotion (out of scope per the spec; deferred).

---

## Task T7: glyph corruption test (3-panel hide+show × 5)

### Goal
Per FR-T09: assert that the 3-panel split-canvas reactivation path does not introduce replacement-character (U+FFFD) glyphs. The test exercises `shouldReleaseWebglRendererOnLayoutHide` (line 1018) and `shouldClearGpuAtlasOnWorkspaceShow` (line 998) across 5 hide/show cycles, with a 200ms gap between cycles.

### Test
- **File:** `src/components/__tests__/TerminalTTY.test.js`
- **Describe (new):** `TerminalTTY split-canvas glyph corruption (FR-T09)`
- **Tests:**
  - `3-panel split, hide+show cycle × 5, no U+FFFD in reactivated buffer`
  - `releaseWebglAddonForInactivePanel called on every hide`
  - `shouldClearGpuAtlasOnWorkspaceShow called on every show`
  - `pendingWebglRecoveryRef stays false (no context loss)`

The test uses the existing `TerminalTTY` mock (test file lines 47-71). The cycle is simulated via fake timers + `act()`.

### Files
- `src/components/__tests__/TerminalTTY.test.js` — **modify** (add describe block)

### Commit
- `test(terminal): add 3-panel split-canvas glyph corruption test (FR-T09)`

### Depends on
T5 (so the test harness can mount the component).

### LOC estimate
~80 tests only = ~80 net.

### Out of scope
- The single-panel-hidden release gap (`docs/errores/03` line 100). Filed in `next_steps` of the verify report.
- The 5-panel swarm-style grid (only the 1×3 split is tested here).

---

## Task T8: swarm-launch-hardening Phase 2 (chunked paste) + Phase 3 (watchdog)

### Goal
**DEFER** — out of this PR's budget. The prompt's review window is 400-800 lines, and the current task set (T1–T7) already lands near 500+ LOC. Phase 2 (chunked paste-buffer in `injectDirectorPrompt`, 16ms pace, 64-chunk cap, sentinel file) and Phase 3 (in-memory `Map<launchId, Map<role, …>>` watchdog in `sidecar-backend/server.js`, respawn policy, PTY spawn semaphore) are larger than the remaining budget.

This task is **marked DEFER**. The next step entry in the verify report will file Phase 2 + Phase 3 as a separate chained PR.

### Test
None in this PR.

### Files
None in this PR.

### Commit
None in this PR.

### Depends on
None.

### LOC estimate
0 (DEFER).

### Out of scope
Everything in Phase 2 and Phase 3.

---

## Dependency graph

```
T1 (filter + ctx)
  ├── T2 (wheel regression)
  └── T3 (sidecar parity)
       └── T4 (tuiAdapter)
            └── T5 (wire onData + viewport mousedown)
                 ├── T6 (renderer_demoted telemetry)
                 └── T7 (glyph corruption test)

T8 (swarm-launch Phase 2/3): DEFER
```

Total ordered: T1 → T2 → T3 → T4 → T5 → T6 → T7.
T2 and T3 are independent of each other; both depend on T1. T3 must complete before T4 because T4's test mounts the component which imports the sidecar regex (used by the component for stale-bundle defense).

---

## Cumulative LOC (terminal-tui-interaction only)

| Task | Impl | Tests | Total |
|------|------|-------|-------|
| T1   | 25   | 50    | 75    |
| T2   | 0    | 40    | 40    |
| T3   | 45   | 70    | 115   |
| T4   | 70   | 80    | 150   |
| T5   | 30   | 50    | 80    |
| T6   | 15   | 30    | 45    |
| T7   | 0    | 80    | 80    |
| T8   | 0    | 0     | 0 (DEFER) |
| **Total** | **185** | **400** | **585** |

**Single PR** (per design.md review workload forecast). 585 LOC + 8 files is within the 400-800 review window.

---

## Apply order

1. T1 (foundation — sessionContext shape)
2. T2 (wheel regression — pins the safe path)
3. T3 (sidecar parity — eliminates drift)
4. T4 (tuiAdapter registry)
5. T5 (wire it all into the call sites)
6. T6 (telemetry hook)
7. T7 (glyph corruption test)
8. T8 (DEFER)

The verify report will list `[git:checkpoint] commit=<sha>` for each task, and the final status is `qa-ready` only when `npm test -- --testPathPattern=terminalNoiseFilter|TerminalTTY|tuiAdapter|sidecar-noise-filter` is green.
