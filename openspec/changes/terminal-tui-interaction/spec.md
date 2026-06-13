# Spec: terminal-tui-interaction

**Branch:** `feature/terminal-renderer-xterm-webgl`
**Source of truth for current state:** `openspec/changes/terminal-tui-interaction/proposal.md` and `exploration.md`.

This spec pins Given/When/Then scenarios for the FR/NFR landed by this change. Each scenario is testable: it names the function or module under test and gives a concrete input/output assertion.

---

## TUI detection matrix

| TUI | scroll | click | ready signal |
|-----|--------|-------|--------------|
| OpenCode | SGR 64/65 (forwarded) | SGR 0 press (forwarded when footer confirmed) | footer regex (`tuiSessionFooterConfirmedRef.current === true` at `src/components/TerminalTTY.jsx:3307`) |
| grok | arrows + SGR 64/65 | SGR 0 press (forwarded when title matches) | grok title match (`detectGrokSessionFromOutput` at `TerminalTTY.jsx:3296`) |
| plain shell | local xterm scrollback (no PTY) | N/A (clicks stay local) | N/A (`mode === 'shell'` — `tuiReady` never set) |

Policy: a panel is treated as TUI-ready **only** when both `mode === 'tui'` AND `tuiReady === true`. SGR click bytes are forwarded to the PTY when the gate is open; otherwise the existing `TERMINAL_MOUSE_CLICK_LEAK_RE` strip at `src/lib/terminal/terminalNoiseFilter.js:52` is applied. Wheel (buttons 64/65) is always forwarded (regression guard).

---

## Scenarios (Given/When/Then)

### FR-T01 — Scroll works without garbage in PTY
**Given** a panel with `sessionContext = { mode: 'tui', tuiReady: true, tuiAdapter: 'opencode' }`
**And** a SGR wheel chunk `\x1b[<64;5;12M` arrives at `terminal.onData` (`TerminalTTY.jsx:3844`)
**When** `filterTerminalInputForSession(sessionContext, chunk)` is called
**Then** the returned string is the SGR wheel chunk unchanged (not stripped, not null)
**And** `wsRef.current.send(...)` forwards the bytes to the PTY
**And** the OpenCode transcript scrolls

**Regression (must not break):**
**Given** a panel with `sessionContext = { mode: 'shell' }`
**And** a SGR wheel chunk `\x1b[<65;5;12M` arrives at `terminal.onData`
**When** `filterTerminalInputForSession(sessionContext, chunk)` is called
**Then** the chunk is also returned unchanged (wheel never stripped, regardless of mode)

### FR-T02 — Click on OpenCode message opens the contextual menu
**Given** a terminal named "Chase" with `tuiSessionFooterConfirmedRef.current === true`
**And** `sessionContext = { mode: 'tui', tuiReady: true, tuiAdapter: 'opencode' }` is built at the `onData` site (`TerminalTTY.jsx:3845`)
**When** the user presses the left mouse button at cell (col=42, row=8) — xterm converts the DOM event to `\x1b[<0;43;9M`
**Then** `filterTerminalInputForSession(sessionContext, '\x1b[<0;43;9M')` returns the SGR press sequence unchanged
**And** the bytes are forwarded over the WebSocket
**And** the OpenCode TUI opens its revert/copy/cancel menu on the focused message
**And** subsequent SGR wheel events (`\x1b[<64;..M` / `\x1b[<65;..M`) still pass through (NFR-T03 combined-sequence guard)

**Negative case (gate must hold):**
**Given** a panel with `tuiSessionFooterConfirmedRef.current === false` (OpenCode just launched, footer not yet matched)
**And** `sessionContext = { mode: 'tui', tuiReady: false }`
**When** a SGR click `\x1b[<0;10;5M` arrives
**Then** `filterTerminalInputForSession` strips the click via `TERMINAL_MOUSE_CLICK_LEAK_RE` (current behavior preserved)
**And** the click does NOT reach the PTY

**Negative case (shell never forwards clicks):**
**Given** a panel with `sessionContext = { mode: 'shell' }`
**When** a SGR click `\x1b[<0;10;5M` arrives
**Then** the click is stripped
**And** the click does NOT reach the PTY (no false-positive forward — NFR-T01)

**Belt-and-suspenders fallback (non-active panel):**
**Given** a non-active OpenCode panel with `tuiReady === true` whose PTY did not register `?1006h` for that cell
**When** `handleViewportMouseDown` at `TerminalTTY.jsx:4246-4290` fires
**Then** the handler calls `buildTerminalMousePressSequence(42, 8)` (defined at `TerminalTTY.jsx:836-840`)
**And** the resulting `\x1b[?1006h\x1b[?1000h\x1b[<0;43;9M\x1b[?1000l\x1b[?1006l` is written to the PTY via `term.inputData` or `wsRef.current.send`

### FR-T08 — TUI adapter contract
**Scenario: tuiAdapter exposes detectReady, wheelStrategy, clickStrategy, focusStrategy**
**Given** a new module `src/lib/terminal/tuiAdapter.js` exporting `getTuiAdapter(programSignature)`
**When** `getTuiAdapter('opencode')` is called
**Then** the returned object has the four keys `detectReady`, `wheelStrategy`, `clickStrategy`, `focusStrategy`
**And** each value is a function (or a small descriptor with `{ type, params }` per design choice)
**And** the `wheelStrategy` for `opencode` returns `{ passThrough: true, buttons: [64, 65] }` (preserve TUI scroll)
**And** the `clickStrategy` for `opencode` returns `{ passThrough: true, button: 0, requireFooterConfirmed: true }`
**And** `focusStrategy` for `opencode` is `{ consume: true }` (strip focus-in/out from input)

**Scenario: tuiAdapter registry returns correct adapter for 'opencode', 'grok', 'plain'**
**Given** the adapter registry is loaded
**When** `getTuiAdapter('opencode')`, `getTuiAdapter('grok')`, and `getTuiAdapter('plain')` are called
**Then** each returns a distinct adapter object
**And** `getTuiAdapter('unknown')` returns the `plain` adapter as a safe fallback (no `tuiReady` ever set)
**And** the legacy `shouldPassthroughNativeTuiWheel({...})` at `TerminalTTY.jsx:4383` is refactored to a thin wrapper around `getTuiAdapter(programSignature).wheelStrategy` (call site stays stable)

**Scenario: tuiAdapter.detectReady returns true within N ms of footer / title**
**Given** an opencode panel where `tuiSessionFooterConfirmedRef.current` flips to `true` on the OpenCode footer match
**When** `getTuiAdapter('opencode').detectReady({ refs: { tuiSessionFooterConfirmedRef, isGrokSession } })` is called within 100 ms of the flip
**Then** it returns `true`
**And** the same call before the flip returns `false`
**And** for `grok`, `detectReady` returns `true` only when `grokTuiReadyRef.current === true` (no false cross-detect)

### FR-T09 — No glyph corruption on split-canvas reactivation
**Scenario: 3-panel split, hide+show cycle, no glyph corruption after 5 cycles**
**Given** a workspace with three panels rendered in a 1×3 split using the WebGL addon
**And** `shouldReleaseWebglRendererOnLayoutHide(panelId, isActive)` at `TerminalTTY.jsx:1018` is registered
**And** `shouldClearGpuAtlasOnWorkspaceShow(workspaceId)` at `:998` is registered
**When** the test harness:
  1. Hides the middle panel (`layoutHideAt = t1`)
  2. Renders an empty cell for 200 ms
  3. Shows the panel again (`layoutShowAt = t2`)
  4. Repeats steps 1–3 five times
**Then** after the fifth show, the reactivated panel's `term.buffer.active` does not contain replacement-character glyphs (U+FFFD) in the rows previously rendered
**And** `releaseWebglAddonForInactivePanel(panelId)` at `TerminalTTY.jsx:2156` was called at every hide
**And** `shouldClearGpuAtlasOnWorkspaceShow` was called at every show
**And** no `webglcontextlost` event was emitted (existing `pendingWebglRecoveryRef` stays `false`)

**Out of scope for this PR** (filed for follow-up): the single-panel-hidden release gap noted in `docs/errores/03-terminal-canvas-glyph-corruption` line 100. This scenario covers only the multi-panel split path.

### FR-T10 — Bootstrap only fires after the TUI footer is real
**Given** a panel launched with `initialCommand = 'opencode'`
**And** `tuiSessionFooterConfirmedRef.current === false` at start
**When** the user reads 50 chunks of PTY output that do NOT match the OpenCode footer regex
**Then** `notifyOpencodeReady` at `TerminalTTY.jsx:1846` has not been called
**And** `pendingOpencodeReadyPostRef` is still set
**And** the bootstrap gate is closed

**When** chunk N+1 matches the OpenCode footer regex
**Then** `tuiSessionFooterConfirmedRef.current` flips to `true` at `TerminalTTY.jsx:3307`
**And** `notifyOpencodeReady` is called exactly once
**And** the `opencode-ready` POST is dispatched

**Regression (must not break):**
**Given** a panel with `initialCommand = 'bash'` (not a TUI)
**And** `tuiSessionActiveRef.current === false` (computed from `isLikelyTuiInitialCommand` at `:1234`)
**When** arbitrary output arrives
**Then** `tuiSessionFooterConfirmedRef.current` stays `false` (no false promotion to TUI)
**And** `notifyOpencodeReady` is never called for a plain shell

---

## NFR scenarios

### NFR-T02 — Sidecar parity
**Scenario: sessionTransport.js filter matches terminalNoiseFilter.js regex exactly**
**Given** the new test file `tests/unit/sidecar-sessionTransport.test.js`
**And** it loads `filterTerminalInputForSession` from both `src/lib/terminal/terminalNoiseFilter.js` (ESM) and `sidecar-backend/sessionTransport.js:132` (CJS)
**When** the test feeds the same corpus of ~30 inputs through both functions (mixed noise, pure DA, mixed click+wheheel, focus reports, window reports, the exact 3× DA cycle from the regression at `src/lib/terminal/terminalNoiseFilter.test.js` line referring to "drops the exact user-reported 3× DA cycle")
**Then** both functions return identical strings for every input
**And** the corpus covers at least: one SGR press (button 0), one SGR release (button `m`), one wheel (button 64), one wheel (button 65), one focus-in, one focus-out, one DA1, one DA2, one DSR, one CPR, one window-size report, one `CSI?35;60;4M`, one `CSI$1;2p`, and one plain text fragment

**Scenario: sidecar parity test fails on regex drift**
**Given** the parity test passes on the current commit
**When** a developer changes `TERMINAL_MOUSE_CLICK_LEAK_RE` in `terminalNoiseFilter.js` without mirroring it in `sidecar-backend/sessionTransport.js`
**Then** the parity test fails in CI
**And** the failure message identifies the first input where ESM and CJS diverge

### NFR-T01 — No leak reintroduction in inactive panels
**Given** three panels A (active, OpenCode ready), B (inactive, OpenCode ready), C (inactive, plain shell)
**And** sessionContext is built per panel from each panel's own refs
**When** the user clicks in panel A (cell 10, 5)
**Then** panel A's filter forwards the click
**And** panel B's filter strips the click (B is not the active panel — xterm does not emit `onData` for B in the first place, but the filter would strip it anyway if it did)
**And** panel C's filter strips the click (`mode === 'shell'`)
**And** no SGR click bytes reach any PTY other than A's

### NFR-T03 — Click-then-scroll regression
**Given** a panel with `tuiReady === true`
**When** the input sequence (in order) is: click `\x1b[<0;3;3M`, wheel-up `\x1b[<64;3;3M`, wheel-down `\x1b[<65;3;3M`
**Then** `filterTerminalInputForSession` returns the concatenation unchanged
**And** all three reach the PTY
**And** the OpenCode context menu opens (from the click) and the transcript scrolls (from the wheel)

### NFR-T06 — `renderer_demoted` telemetry hook
**Given** a panel with `pendingWebglRecoveryRef.current === false` and WebGL active
**When** `handleWebglContextLoss` at `TerminalTTY.jsx:2306` fires
**And** the demotion path is taken (`pendingWebglRecoveryRef.current = true` at `:2315`)
**Then** a `renderer_demoted` telemetry event is emitted exactly once per context-loss event
**And** the event payload includes `{ panelId, from: 'webgl', to: 'webgl-recovery-pending', at: <iso timestamp> }`
**And** the telemetry hook does NOT fire on `pendingWebglRecoveryRef.current === true` (re-promotion at `:2293` is not a demotion)

### NFR-T07 — TDD
**Given** the apply phase is in progress
**When** each production code change lands
**Then** the corresponding test was added in the same commit (or earlier in the same PR)
**And** the test name follows the jest style "X should Y when Z" (or describe/it pair)

---

## Out of scope

Restated from `proposal.md` §Scope out:

- Zed tools (`src/lib/asistente/**`, `docs/prompts/asistente/**`) — owned by Agent 2.
- Pizarra (`src/components/pizarra/**`, `src/lib/pizarra/**`) — Agent 3.
- Swarm-launch Phase 1 perf (worktree parallel, fanout).
- `globals.css`, `themes.js` — Agent 4.
- `src/lib/agentLaunchWrapper.js` rewrite — current bootstrap gate stays as-is.
- swarm-launch-hardening **Phase 2 chunked paste-buffer** (16ms pace, 64-chunk cap, sentinel) — separate change.
- swarm-launch-hardening **Phase 3 watchdog** (in-memory `Map<launchId, Map<role, …>>`, respawn policy, PTY spawn semaphore) — separate change.
- One-way `webgl → canvas2d → dom` demotion with the same Terminal instance preserved — separate change.
- Auto-rename of displayName based on TUI detection (e.g., name "Chase" → "OpenCode" when opencode boots) — future change (see `terminal-display-names/spec.md`).

---

## Affected files (re-stated for spec traceability)

| File | Spec scenario IDs |
|------|-------------------|
| `src/lib/terminal/terminalNoiseFilter.js` | FR-T01, FR-T02, NFR-T01, NFR-T02 |
| `src/lib/terminal/tuiAdapter.js` (new) | FR-T08 |
| `src/lib/terminal/terminalNoiseFilter.test.js` | FR-T01, FR-T02, NFR-T01 |
| `src/components/TerminalTTY.jsx` | FR-T02, FR-T08, FR-T09, FR-T10, NFR-T06 |
| `src/components/__tests__/TerminalTTY.test.js` | FR-T02, FR-T08, FR-T09, FR-T10, NFR-T03, NFR-T06 |
| `sidecar-backend/sessionTransport.js` | NFR-T02 (no code change; parity test only) |
| `tests/unit/sidecar-sessionTransport.test.js` (new) | NFR-T02 |
| `src/app/api/terminal/processes/route.js` | displayName enrichment (also covered by `terminal-display-names/spec.md`) |
