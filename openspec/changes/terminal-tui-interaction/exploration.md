# Exploration — terminal-tui-interaction

**Date:** 2026-06-11
**Branch:** `feature/terminal-renderer-xterm-webgl`
**Branch status:** 8 files modified (uncommitted), 1 file untracked (`docs/delegation/`). `git diff --stat`: 94 insertions, 31 deletions.

Mission context: `docs/delegation/01-agent-terminales.md`. The branch already carries WIP work on TUI interaction (TerminalTTY.jsx, terminalNoiseFilter.js). This document verifies what is already done vs. missing.

---

## 1. Root cause of the click issue — verified

### 1.1 Click filtering is in place; the session context is missing

The filter that blocks SGR mouse click bytes is **already implemented** in `src/lib/terminal/terminalNoiseFilter.js`:

- Line 52 — regex: `TERMINAL_MOUSE_CLICK_LEAK_RE = /\x1b\[<(0|[1-3]);[\d;]*[mM]/g`. Matches SGR press (M) and release (m) for buttons 0–3 (left click, middle, right, release). **Wheel buttons 64/65 are explicitly NOT matched** — this is the regression guard.
- Line 65 — `stripTerminalMouseClickLeak(chunk)` applies that regex.
- Line 79 — `stripTerminalInputNoise(chunk)` chains `TERMINAL_WINDOW_REPORT_RE`, `SHELL_TERMINAL_RESPONSE_RE`, `TERMINAL_FOCUS_REPORTING_RE`, then `TERMINAL_MOUSE_CLICK_LEAK_RE`.
- Line 135 — `filterTerminalInputForSession(_session, chunk)` is the public entry. It returns `null` for pure-noise chunks, otherwise the stripped string.

The current call site in `src/components/TerminalTTY.jsx:3844-3854`:

```js
terminal.onData((data) => {
  const filtered = filterTerminalInputForSession(null, data);
  if (filtered === null) return;
  ...
  wsRef.current.send(...);
});
```

**Verified gap:** the `null` session argument is the root cause. There is no way for the filter to know whether the TUI is active and ready, so it strips clicks **unconditionally** for every panel in every mode.

### 1.2 `buildTerminalMousePressSequence` exists but has no call sites

`src/components/TerminalTTY.jsx:836-840` defines:

```js
export function buildTerminalMousePressSequence(col, row) {
  const x = Math.max(1, Math.floor(col) + 1);
  const y = Math.max(1, Math.floor(row) + 1);
  return `\x1b[?1006h\x1b[?1000h\x1b[<0;${x};${y}M\x1b[?1000l\x1b[?1006l`;
}
```

**Verified gap:** `grep -n "buildTerminalMousePressSequence" src/` returns only the definition. Zero call sites. The function is dead code in the current branch.

### 1.3 `tuiSessionFooterConfirmedRef` and `mode: 'tui'` exist; never passed to the filter

`src/components/TerminalTTY.jsx`:

- Line 1234 — `const tuiSessionActiveRef = useRef(isLikelyTuiInitialCommand(initialCommand))` — initial guess from the command.
- Line 1235 — `const tuiSessionFooterConfirmedRef = useRef(false)` — flipped to `true` only when the OpenCode footer is detected in output.
- Line 3296 — `tuiSessionActiveRef.current = true` after `detectOpenCodeTuiReady` / `detectGrokSessionFromOutput`.
- Line 3307 — `tuiSessionFooterConfirmedRef.current = true` when the OpenCode footer regex matches.
- Line 3311 — `prepareActiveTuiTerminalFocus(term, { tuiSessionActive: true })` is called.

The ref is **read** at line 4383 inside the wheel handler:

```js
shouldPassthroughNativeTuiWheel({
  isGrokSession,
  grokTuiReady: grokTuiReadyRef.current,
  opencodeFooterConfirmed: tuiSessionFooterConfirmedRef.current,
})
```

**Verified gap:** the same `tuiSessionFooterConfirmedRef.current` is never passed to `filterTerminalInputForSession` on line 3845. The session argument is hard-coded to `null`.

### 1.4 `handleViewportMouseDown` does NOT emit a click sequence to the PTY

`src/components/TerminalTTY.jsx:4246-4290` (the handler bound to `onMouseDown` on the viewport shell, line 4641) computes the cell, decides transcript vs input zone, calls `prepareActiveTuiTerminalFocus`, and `term?.focus()`. **It does not call `buildTerminalMousePressSequence`.** Click forwarding to the PTY happens only via xterm's `onData` (xterm intercepts the DOM event and converts it to an SGR sequence); the noise filter then strips it.

### 1.5 sessionContext shape

The function signature at `src/lib/terminal/terminalNoiseFilter.js:135`:

```js
export function filterTerminalInputForSession(_session, chunk)
```

The leading underscore marks `_session` as intentionally unused. The doc comment on lines 130-133 states:

> "The `session` argument is currently informational and accepted for symmetry with the output filter; future gating by session.mode can be added here without changing call sites."

**No sessionContext object is constructed anywhere in the current branch.** The shape is implied only: `{ mode: 'tui' | 'shell' }` based on the parameterization comment.

---

## 2. Existing tests — inventory

### 2.1 `src/lib/terminal/terminalNoiseFilter.test.js`

29 `test()` titles in 6 `describe()` blocks. Verbatim test titles:

`SHELL_TERMINAL_RESPONSE_RE`:
1. "is a global regex"

`stripShellTerminalResponseNoise`:
2. "returns the chunk unchanged for empty / non-string input"
3. "strips DA1 (CSI ? Pd c) responses"
4. "strips DA2 (CSI > Pp c) responses"
5. "strips DSR (CSI Pd n) responses"
6. "strips CPR (CSI Pd R) responses"
7. "strips window-size report (CSI 4 ; height ; width t) responses"
8. "strips repeated DA cycles from TUI re-probes"

`containsTerminalResponseNoise`:
9. "returns true for DA1 responses"
10. "returns true for DA2 responses"
11. "returns true for DSR responses"
12. "returns true for CPR responses"
13. "returns true for mixed text containing a single DA fragment"
14. "returns false for plain text with digits and semicolons"
15. "returns false for SGR color escapes (styling, not responses)"
16. "returns false for progress-bar style output"
17. "returns false for empty / non-string input"

`filterTerminalInputForSession`:
18. "returns the chunk unchanged when there is no noise"
19. "returns the chunk unchanged for empty / non-string input"
20. "drops pure DA1+DA2 answerback chunks and returns null"
21. "drops pure DSR chunks and returns null"
22. "drops pure CPR chunks and returns null"
23. "drops the exact user-reported 3× DA cycle and returns null (regression)"
24. "strips noise from mixed input and forwards the rest"
25. "strips noise that wraps a user keystroke"
26. "does not over-strip legitimate TUI input containing digits and semicolons"
27. "does not strip SGR color escapes from input"
28. "is symmetric with the output filter: same regex, same stripping"
29. "accepts a session argument for forward-compatibility (currently informational)"
30. "drops pure focus-in/out reporting chunks and returns null"
31. "strips focus reporting from mixed input and forwards the rest"
32. "drops pure SGR mouse click reports and returns null"
33. "forwards SGR mouse wheel reports (64/65) for TUI transcript scroll"
34. "strips SGR mouse click leaks from mixed input and forwards the rest"

`filterTerminalOutputForSession`:
35. "strips DA noise from PTY output in all session modes"
36. "strips SGR mouse reports from PTY output"
37. "strips Page Up/Down wheel leak echoes from PTY output"

`T2.1 — DECRQM / DECRPM terminators (swarm-launch-hardening)`:
38. "T2.1 strips DECRQM (CSI ? 35 ; 60 ; 4 M) from a chunk"
39. "T2.1 strips DECRPM (CSI $ 1 ; 2 p) from a chunk"
40. "T2.1 reports containsTerminalResponseNoise true for DECRQM and DECRPM"

**No test exists for:**
- Forwarding SGR click through the filter when `session.mode === 'tui'` and footer is confirmed.
- Skipping the click filter when `session.mode === 'shell'`.
- The interaction between `tuiSessionFooterConfirmedRef` and `filterTerminalInputForSession`.
- `buildTerminalMousePressSequence` itself (the function is exported but not tested).
- `prepareActiveTuiTerminalFocus` writing the `TERMINAL_ENABLE_TUI_MOUSE_REPORTING_SEQ` burst.

### 2.2 `src/components/__tests__/TerminalTTY.test.js`

44 `describe()` blocks. The relevant ones for TUI interaction:

- `getXtermContainerAnimProps()` (line 317) — pure animation helper.
- `shouldShowTerminalLoadingOverlay()` / `shouldShowTerminalViewport()` / `shouldShowTerminalStatusOverlay()` (lines 340/349/381) — overlay gates.
- `fitTerminalViewport()` / `proposeTerminalViewportDimensions()` (lines 851/424) — viewport sizing.
- `stabilizeTerminalRenderer()` (line 521) — atlas/refresh.
- `shouldSyncTerminalViewportOnLayoutShow()` (line 575), `shouldRunPanelClickViewportRecovery()` (584), `shouldRecoverPanelOnActivation()` (591), `shouldClearWebglAtlasOnPanelActivation()` (600) — recovery helpers.
- `shouldFreezeSingleWebglViewportOnWorkspaceShow()` (623), `shouldClearGpuAtlasOnWorkspaceShow()` (663), `shouldReleaseWebglRendererOnLayoutHide()` (719), `shouldReleaseCanvasRendererOnLayoutHide()` (738) — split/renderer lifecycle.
- `shouldOpenNativeVtePanel()` (1179), `resolveTerminalRuntimePhase()` (1209) — native VTE phase.
- `TERMINAL_NATIVE_CONTENT_BODY_STYLE` (1325) — morphology test.
- `terminal wheel scroll helpers` (1703) — wheel pure-function tests.
- `TerminalTTY renderer fallback UI` (1363) — integration with mocked xterm/WS/native bridge.
- `TerminalTTY suspended state` (3877) — suspended overlay.

**No test exists for:**
- `handleViewportMouseDown` (no test reaches the mousedown handler on the viewport shell with a non-active panel).
- SGR click forwarded to the PTY when the panel has `tuiSessionFooterConfirmedRef.current === true`.
- A regression test for "click is forwarded, wheel still scrolls" combined (NFR-T03).
- `buildTerminalMousePressSequence` integration (the function itself or its absence in a call path).
- `TERMINAL_ENABLE_TUI_MOUSE_REPORTING_SEQ` being written by `prepareActiveTuiTerminalFocus` when `tuiSessionActive === true`.

`grep -n "buildTerminalMousePressSequence\|filterTerminalInputForSession" src/components/__tests__/TerminalTTY.test.js` returns 0 matches.

### 2.3 Sidecar parity test (NFR-T02)

`grep -rn "filterTerminalInputForSession" sidecar-backend/` returns only the function definition in `sidecar-backend/sessionTransport.js:132`. **No test file in `tests/unit/` covers sidecar parity for this filter.** The doc comment on lines 12-22 of `sessionTransport.js` explicitly states the two copies must stay in sync and warns that drift is a known risk.

---

## 3. swarm-launch-hardening — Phase 2 and Phase 3 status

Source: `openspec/changes/swarm-launch-hardening/design.md`. Phase 1 is explicitly out of scope (per the prompt).

### 3.1 Phase 2 — buffer (DESIGN §3.2) — status

- **Output filter regex extension `[cnRM]` + `\$[0-9;]*p`** ✅ Applied. Verified at `src/lib/terminal/terminalNoiseFilter.js:36-37`:
  ```js
  export const SHELL_TERMINAL_RESPONSE_RE =
    /(?:\x1b\[\?(?:\d+;)*\d+[cnRM]|\x1b\[>(?:\d+;)*\d+c|\x1b\[\$(?:\d+;)*\d+p|\x1b\[(?:\d+;)*\d+n|\x1b\[(?:\d+;)*\d+R)/g;
  ```
  The `M` and `\$...p` alternations are present. The T2.1 regression test block at `src/lib/terminal/terminalNoiseFilter.test.js:210-234` covers `CSI?35;60;4M` and `CSI$1;2p`.

- **Per-pane scrollback 5000** ✅ Applied. Verified at `src/components/TerminalTTY.jsx:3771`:
  ```js
  scrollback: 5000,
  ```
  Doc comment on lines 3764-3771 references R-BUF-3 and explains the 5-pane × 5000-line memory budget.

- **Chunked paste-buffer algorithm** ❌ Not in this branch. The design's chunking layer (`injectDirectorPrompt`, 16ms pace, 64-chunk cap, sentinel file) lives in `src/lib/operations/swarmControl.js` / `src/lib/agentLaunchWrapper.js`. No grep hit for `injectDirectorPrompt` in either file. The current `agentLaunchWrapper.js` builds a wrapper that defers bootstrap via the `opencode-ready` marker file (verified in `agentLaunchWrapper.test.js:562-690`), which is a different mechanism than the design's chunked paste-buffer.
- **Lock file `/tmp/devhub-bootstrap-${missionId}-${role}.lock` with sentinel** ❌ Not visible in the current tree.
- **Per-pane scrollback tests** ❌ No test asserts `scrollback: 5000` is passed to `new Terminal(...)`. The `TerminalTTY.test.js` mock at lines 47-71 creates a fake Terminal and never inspects the constructor options.

### 3.2 Phase 3 — crash (DESIGN §3.3) — status

- **In-memory `Map<launchId, Map<role, { respawnBudget, lastExit, readyAt }>>` in `sidecar-backend/server.js`** ❌ Not in this branch. `grep -n "respawnBudget\|crashRecoveryWatchdog\|launchId.*Map" sidecar-backend/` returns no matches. The comment at `sidecar-backend/sessionTransport.js:2-10` acknowledges a watchdog scaffold was planned but is not yet implemented in CJS.
- **Respawn policy (1 budget per `launchId, role`, banner after second exit)** ❌ Not implemented.
- **PTY spawn serialization (semaphore, max 2 concurrent)** ❌ Not visible. `grep -n "pty.spawn\|semaphore" sidecar-backend/` not run; design calls for the change in `wss.on('connection')`, but no test asserts a cap.
- **WebGL demotion `webgl → canvas2d → dom` on `webglcontextlost` with the same Terminal instance preserved** 🟡 Partial. The capability module at `src/components/terminal/terminalRendererCapabilities.js:216-320` (`probeWebglSupport`) returns one of 8 fallback reasons. `TerminalTTY.jsx:2306-2329` (`handleWebglContextLoss`) demotes the addon, sets `pendingWebglRecoveryRef.current = true`, and `scheduleWebglRecovery` (line 2293) reattaches WebGL after 400ms — this is a **re-promotion path**, not the one-way `webgl → canvas2d → dom` the design specifies (line 134: "one-way, per-launch").
- **Telemetry `renderer_demoted`** ❌ No grep hit for `renderer_demoted` in `src/`.

---

## 4. FR-T0X / NFR-T0X coverage table

| Req | Status | Evidence |
|-----|--------|----------|
| FR-T01 (scroll without garbage) | 🟡 partial | Wheel SGR 64/65 is preserved by `containsTerminalInputNoise` (terminalNoiseFilter.js:91) and test "forwards SGR mouse wheel reports (64/65) for TUI transcript scroll" (test #33). `TERMINAL_WHEEL_PAGE_LEAK_RE` strips Page Up/Down echoes (test #37). However, no integration test asserts the full TUI scroll chain. The docs/errores/03 doc marks the bug as still reproducible (line 7). |
| FR-T02 (click on OpenCode → context menu) | ❌ missing | `handleViewportMouseDown` at TerminalTTY.jsx:4246 does not call `buildTerminalMousePressSequence` (zero call sites). The `onData` filter at line 3845 strips SGR clicks unconditionally. `tuiSessionFooterConfirmedRef` is set on line 3307 but never consulted by the filter. |
| FR-T08 (TUI adapter contract `detectReady`/`wheelStrategy`/`clickStrategy`/`focusStrategy`) | ❌ missing | No file exports a `tuiAdapter` registry. `shouldPassthroughNativeTuiWheel` is a single function, not an adapter interface. |
| FR-T09 (no glyph corruption on panel reactivation) | 🟡 partial | `shouldReleaseWebglRendererOnLayoutHide` (line 1018) + `releaseWebglAddonForInactivePanel` (line 2156) release WebGL on hide for webgl mode. `shouldReleaseCanvasRendererOnLayoutHide` (line 1031) does the same for canvas. The docs/errores/03 doc says WebGL is NOT released for single-panel workspaces (line 100: "falta release de WebGL on layout hide en paneles de workspace único"). No test covers the split-3-panels glyph corruption scenario. |
| FR-T10 (bootstrap only after footer TUI real) | 🟡 partial | `tuiSessionFooterConfirmedRef.current` is set at line 3307; the `opencode-ready` POST happens at line 3309 only after that. `notifyOpencodeReady` (line 1846) short-circuits if the ref is already true. The `viewportFitConfirmed` is decoupled from the bootstrap gate by design (comment on line 1921). No test asserts that bootstrap is blocked before the footer is seen. |
| NFR-T01 (no leaks in inactive panels on TUI clicks) | 🟡 partial | Same evidence as FR-T09. |
| NFR-T02 (sidecar parity test) | ❌ missing | No test in `tests/unit/` covers `sidecar-backend/sessionTransport.js:132 filterTerminalInputForSession`. The doc comment on `sessionTransport.js:12-22` flags this as a drift risk. |
| NFR-T03 (regression test for scroll when click strategy changes) | ❌ missing | No test covers click-then-scroll in sequence. |
| NFR-T06 (no WebGL crash on split panel) | 🟡 partial | `neutralizeWebglAddonForDisposal` (TerminalTTY.jsx:395) replaces `_renderer.value.handleResize` with a noop. `disposeXtermRuntime` (line 1425) follows a 7-step teardown order. `shouldClearGpuAtlasOnWorkspaceShow` (line 998) prevents aggressive atlas clears. No test simulates a split-3 WebGL panel crash. |
| NFR-T07 (TDD mandatory) | ✅ observed in branch | All currently modified source files have corresponding test additions per the diff stat (terminalNoiseFilter.test.js +5 lines, TerminalTTY.test.js +17 lines, agentLaunchWrapper.test.js +4 lines, swarm-route-launch-command.test.js +1 line). |

---

## 5. Files to touch in the apply phase (within scope per the delegation prompt)

Already in scope (`docs/delegation/01-agent-terminales.md` §Alcance):
- `src/lib/terminal/**` — new `tuiAdapter.js`, new `displayNamePool.js`, new `panelDisplayName.js`
- `src/components/TerminalTTY.jsx` — pass `tuiSessionFooterConfirmedRef` into the `onData` filter
- `src/components/TerminalWorkspacesManager.jsx` — naming UI + persistence (covered in `terminal-display-names/exploration.md`)
- `src/components/terminal/**` — registry/adapter integration
- `sidecar-backend/sessionTransport.js` — CJS parity for the session-aware filter
- `src/app/api/terminal/**` — displayName in processes API (covered in `terminal-display-names/exploration.md`)
- Tests corresponding to all of the above

Not in scope: `src/lib/agentLaunchWrapper.js` (only the existing bootstrap gate is stable; do not rewrite — current branch has +41 LOC diff that should be kept).

---

## 6. Open questions surfaced (for propose phase)

1. **What is the exact session shape passed to the filter?** The current `_session` is unused. The minimum to ship FR-T02 is `{ mode: 'tui', footerConfirmed: true }`. The broader TUI adapter contract (FR-T08) likely wants `{ mode, adapter: 'opencode'|'grok'|'shell', clickStrategy, wheelStrategy }` — but that is a separate design call.
2. **Does the click forward go through the existing `onData` path, or does the viewport mousedown handler send a synthesized sequence directly?** Both approaches are present in the codebase (the filter is on `onData`; `buildTerminalMousePressSequence` exists at the viewport level but is uncalled). The delegation prompt says "extender filtro con contexto de sesión TUI activa" — that points at the `onData` path. A small viewport-mousedown path could be used as a belt-and-suspenders fallback for TUIs that do not register `?1006h` on the right element.
3. **Should the sidecar's CJS filter be invoked on the input path or just kept as documentation?** The sidecar's `filterTerminalInputForSession` (sessionTransport.js:132) has the same body as the ESM version. The delegation prompt's NFR-T02 says "test CI que falle en drift" — that is a new test, not a code change to the sidecar filter itself.
4. **Phase 2 chunked paste-buffer is missing in this branch.** The design specifies it. Should the apply phase ship it inside `terminal-tui-interaction` (related: bootstrap/timing) or in a follow-up change? Recommendation: leave out of this change, file as gap in the next_steps.
5. **Phase 3 watchdog + WebGL one-way demotion is not implemented.** Out of scope for this change; the prompt says "Phase 1 perf" is out, but the same wording about Phase 2 and Phase 3 may apply. The user's mission text only references buffer (Phase 2) and crash (Phase 3) as candidates. Recommend: ship the bare-minimum WebGL demotion telemetry hook now (NFR-T01 evidence), defer the full watchdog to a follow-up.
