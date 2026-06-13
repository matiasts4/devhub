# Proposal: terminal-tui-interaction

## Why

In OpenCode TUI panels, scroll works (wheel SGR 64/65 is preserved by `containsTerminalInputNoise` in `src/lib/terminal/terminalNoiseFilter.js:91`) but click does not (UC-1 in `docs/delegation/01-agent-terminales.md:60-62` is failing). Root cause, verified:

1. `filterTerminalInputForSession(_session, chunk)` is called with `session=null` hard-coded at `src/components/TerminalTTY.jsx:3845`. The filter has no way to know whether the TUI is ready, so it strips SGR click bytes (`\x1b[<0;x;yM`) **unconditionally** for every panel and every mode (`TERMINAL_MOUSE_CLICK_LEAK_RE` at `src/lib/terminal/terminalNoiseFilter.js:52`).
2. The TUI-ready signal exists: `tuiSessionFooterConfirmedRef` is declared at `src/components/TerminalTTY.jsx:1235`, flipped to `true` at `:3307` once the OpenCode footer is detected — but it is **never read** by the filter. It is only consumed by `shouldPassthroughNativeTuiWheel` at `:4383`.
3. `buildTerminalMousePressSequence(col, row)` at `src/components/TerminalTTY.jsx:836-840` is dead code — zero call sites in the branch.
4. The CJS copy in `sidecar-backend/sessionTransport.js:132` has drifted-shape contract with the ESM source of truth (NFR-T02 says "test CI que falle en drift" — that test does not exist anywhere in `tests/`).
5. No test covers glyph corruption on the 3-panel split-canvas reactivation path (FR-T09, `docs/errores/03-terminal-canvas-glyph-corruption`).

The user-visible problem: clicking a message inside an OpenCode TUI does not open the context menu (revert/copy/cancel). The user has to keyboard-navigate. After a click, wheel scroll still works — that must not regress.

## What changes

- Replace the `null` session arg at `src/components/TerminalTTY.jsx:3845` with a `sessionContext` built from the existing refs: `{ mode: 'tui' | 'shell', tuiReady: tuiSessionFooterConfirmedRef.current, tuiAdapter?: 'opencode' | 'grok' | 'shell' }`.
- Extend `filterTerminalInputForSession` in `src/lib/terminal/terminalNoiseFilter.js:135` to read `session.mode` and `session.tuiReady`: when `mode === 'tui' && tuiReady === true`, **skip** the `TERMINAL_MOUSE_CLICK_LEAK_RE` step; keep stripping the other noise classes (DA, focus, window report).
- New `src/lib/terminal/tuiAdapter.js`: a small registry exporting `getTuiAdapter(programSignature)` returning `{ detectReady, wheelStrategy, clickStrategy, focusStrategy }` for the three known TUIs (opencode, grok, plain shell). `shouldPassthroughNativeTuiWheel` becomes a thin wrapper around this registry — keep its call site stable.
- Wire `handleViewportMouseDown` at `src/components/TerminalTTY.jsx:4246-4290` to call `buildTerminalMousePressSequence(col, row)` on the **non-active** panel path as a belt-and-suspenders fallback for TUIs that did not register `?1006h`. Active panel clicks continue to go through the xterm `onData` → filter path (the fix above makes the filter forward them).
- Add `src/app/api/terminal/processes/route.js` enrichment so the GET response carries `{ terminalId, displayName, program?, tuiReady? }` per `docs/delegation/01-agent-terminales.md:127`. Frontend-enriched (panel state joined client-side) — no backend change.
- Sidecar parity: add `tests/unit/sidecar-sessionTransport.test.js` covering `filterTerminalInputForSession` with the new session shapes (NFR-T02). Keep the CJS regex mirrored; do **not** change the CJS filter body in this PR — the parity test is the safety net.
- New `src/components/__tests__/TerminalTTY.test.js` cases: SGR click forwarded when TUI ready (FR-T02), wheel still scrolls after a click (NFR-T03), `buildTerminalMousePressSequence` produces the expected enable/SGR/disable burst, `prepareActiveTuiTerminalFocus` writes `TERMINAL_ENABLE_TUI_MOUSE_REPORTING_SEQ` when `tuiSessionActive === true`, and a regression test for the 3-panel split WebGL reactivation (FR-T09).
- New `src/lib/terminal/terminalNoiseFilter.test.js` cases for `filterTerminalInputForSession` with `{ mode: 'tui', tuiReady: true }` (forward click) and `{ mode: 'shell' }` (strip click — current behavior preserved).
- **swarm-launch-hardening** Phase 2 chunked paste-buffer + sentinel and Phase 3 watchdog + one-way WebGL demotion: **deferred** (see Scope out). Add a telemetry hook `renderer_demoted` event in `src/components/TerminalTTY.jsx` near `handleWebglContextLoss` (`:2306`) so the evidence trail is in place for the follow-up change.

## Impact

Status legend: ✅ done in this PR · 🟡 partial — better evidence, not a full fix · ❌ still missing after PR.

| Req | Status after PR | What lands |
|-----|-----------------|------------|
| FR-T01 (scroll without garbage) | 🟡 | New "click-then-scroll" regression test in `TerminalTTY.test.js` (NFR-T03). Full integration test deferred — wheel logic itself unchanged. |
| FR-T02 (click on OpenCode → context menu) | ✅ | Filter forwards SGR click when `mode==='tui' && tuiReady===true`; `buildTerminalMousePressSequence` wired on the non-active path. |
| FR-T03 (shell wheel local) | 🟡 | Unchanged. New test pins the behavior. |
| FR-T08 (TUI adapter contract) | ✅ | `tuiAdapter.js` registry exports `detectReady` / `wheelStrategy` / `clickStrategy` / `focusStrategy`. |
| FR-T09 (no glyph corruption on split reactivation) | 🟡 | New split-3-panel test exercises `shouldReleaseWebglRendererOnLayoutHide` (`:1018`) and `shouldClearGpuAtlasOnWorkspaceShow` (`:998`). The single-panel-hidden release gap (`docs/errores/03` line 100) is filed in Next Steps — separate fix. |
| FR-T10 (bootstrap after footer) | 🟡 | Unchanged behavior; new test asserts `notifyOpencodeReady` is gated on `tuiSessionFooterConfirmedRef`. |
| NFR-T01 (no leaks in inactive panels) | 🟡 | Improved by the `tuiReady` gate — clicks still stripped for `mode==='shell'`. Full 1-panel WebGL release deferred. |
| NFR-T02 (sidecar parity test) | ✅ | New test loads both ESM and CJS regexes, fuzzes the same input set, asserts parity. |
| NFR-T03 (regression test for click-then-scroll) | ✅ | Combined sequence test in `TerminalTTY.test.js`. |
| NFR-T06 (no WebGL crash on split) | 🟡 | Demotion telemetry hook added; one-way demotion itself deferred. |
| NFR-T07 (TDD) | ✅ | All impl lines have a corresponding test. |

## Scope in

- SGR click forwarding in `src/lib/terminal/terminalNoiseFilter.js` (gated by `sessionContext`).
- New `src/lib/terminal/tuiAdapter.js` with the three-strategy registry.
- Wire `tuiSessionFooterConfirmedRef` and the new adapter into `src/components/TerminalTTY.jsx` at the `onData` site (`:3845`) and the `handleViewportMouseDown` site (`:4246`).
- Sidecar parity test in `tests/unit/sidecar-sessionTransport.test.js`.
- Test additions in `src/lib/terminal/terminalNoiseFilter.test.js`, `src/components/__tests__/TerminalTTY.test.js`.
- `src/app/api/terminal/processes/route.js`: enrich the GET response with `displayName` (read from a small `data/panels.json` the frontend writes — see `terminal-display-names/proposal.md`).
- `renderer_demoted` telemetry hook (single event emit on context loss path).

## Scope out

- Zed tools (`src/lib/asistente/**`, `docs/prompts/asistente/**`) — owned by Agent 2.
- Pizarra (`src/components/pizarra/**`, `src/lib/pizarra/**`) — Agent 3.
- Swarm-launch Phase 1 perf (worktree parallel, fanout).
- `globals.css`, `themes.js` — Agent 4.
- `src/lib/agentLaunchWrapper.js` rewrite — current bootstrap gate stays as-is.
- swarm-launch-hardening **Phase 2 chunked paste-buffer** (16ms pace, 64-chunk cap, sentinel) — separate change.
- swarm-launch-hardening **Phase 3 watchdog** (in-memory `Map<launchId, Map<role, …>>`, respawn policy, PTY spawn semaphore) — separate change.
- One-way `webgl → canvas2d → dom` demotion with the same Terminal instance preserved — separate change.
- Auto-rename of displayName based on TUI detection (e.g., name "Chase" → "OpenCode" when opencode boots) — future change.

## Affected files

| File | Change kind |
|------|-------------|
| `src/lib/terminal/terminalNoiseFilter.js` | Modify — accept `sessionContext` in `filterTerminalInputForSession`; branch on `mode` + `tuiReady`. |
| `src/lib/terminal/tuiAdapter.js` | **New** — registry for opencode / grok / shell. |
| `src/lib/terminal/terminalNoiseFilter.test.js` | Modify — add session-context cases. |
| `src/components/TerminalTTY.jsx` | Modify — wire `tuiSessionFooterConfirmedRef` into `onData` (`:3845`); wire `buildTerminalMousePressSequence` into `handleViewportMouseDown` (`:4246`); add `renderer_demoted` telemetry. |
| `src/components/__tests__/TerminalTTY.test.js` | Modify — click-forward, click-then-scroll, adapter, demotion-telemetry tests. |
| `sidecar-backend/sessionTransport.js` | **No code change.** Parity test added. |
| `tests/unit/sidecar-sessionTransport.test.js` | **New** — NFR-T02 parity test. |
| `src/app/api/terminal/processes/route.js` | Modify — enrich GET with `displayName`, `program?`, `tuiReady?`. |
| `data/panels.json` (or new helper in `src/lib/terminal/panelDisplayName.js`) | **New** — read-only at API layer, written by frontend (see display-names proposal). |

## Open questions

1. **Adapter identity source.** Where does the frontend learn the adapter for a given panel — initialCommand regex, output detection, or user-set? Recommend: derive from `initialCommand` (opencode / hermes / grok) plus the existing `detectOpenCodeTuiReady` footer match. Confirm in spec phase.
2. **Click-strategy fallback at viewport.** When `mode==='tui' && tuiReady===true`, do we send the click via the existing `onData` path (filter forward), or call `buildTerminalMousePressSequence` from the mousedown handler? Spec phase will lock the policy. Default: onData forward; viewport mousedown only for the non-active panel path (already-active is xterm's job).
3. **`program` field in processes API.** The `program?` shape is optional in the spec hint. If absent, the response keeps current behavior. Confirm in spec phase whether the field is required (Zed may rely on it).

## Review workload forecast

≈ 320 net LOC across 6 files (1 new file, 5 modified). Fits single PR under the 400-line budget. The sidecar parity test alone is ~70 lines (fuzz harness + ESM/CJS import), the adapter registry ~40 lines, filter changes ~25 lines, TerminalTTY wiring ~40 lines, the four new `TerminalTTY.test.js` cases ~120 lines.

## Risk

- **False-positive click forward.** If `mode==='tui'` is set before the footer is confirmed, the filter forwards clicks to a PTY that has not yet enabled mouse reporting → the bytes are dropped by the PTY. Mitigation: the gate is `tuiReady === true` (footer confirmed), not just `mode === 'tui'`. Test pins both signals.
- **Sidecar regex drift.** Adding a new noise class to the ESM filter without mirroring the CJS regex produces a different filter result for stale-desktop-bundle clients. Mitigation: the parity test loads both regexes from disk and asserts identical output for a corpus. If drift returns, the test fails in CI.
- **Adapter misdetection.** A panel launched with `bash` followed by `opencode` typing still has `mode==='shell'` until the footer match. The wheel/click/focus strategies are read off the adapter registry, not the session mode — so a shell with a TUI command typed in still gets local wheel. This is the intended behavior.
- **Telemetry hook regression.** Adding a `renderer_demoted` emit on the demotion path could double-fire if recovery retries. Mitigation: emit only in the `pendingWebglRecoveryRef.current = true` branch (`:2315`), once per context-loss event.
