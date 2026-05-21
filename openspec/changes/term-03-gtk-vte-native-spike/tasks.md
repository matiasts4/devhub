# Tasks: TERM-03 GTK VTE Native Spike

## Phase 1: Capability seams

- [x] 1.1 RED: add `src/components/__tests__/terminalRendererCapabilities.test.js` cases for Linux/Tauri probe readiness, fallback reasons, and requested/effective preservation for `vte-experimental`.
- [x] 1.2 GREEN: update `src/components/terminal/terminalRendererCapabilities.js` to expose probe-gated readiness plus `unsupported-platform`, `tauri-unavailable`, `probe-failed`, and `open-failed` reasons while keeping `xterm` always ready.
- [x] 1.3 Create `src/lib/terminal/nativeVteBridge.js` as the only JS seam for `probe/open/focus/resize/close` and native event re-dispatch; keep Tauri calls out of React components.

## Phase 2: Rust/GTK bridge

- [x] 2.1 Create `src-tauri/src/native_vte.rs` with Linux-only single-active-panel registry, same-window GTK/VTE attach, session websocket reuse, and deterministic probe/open failure reasons.
- [x] 2.2 Update `src-tauri/src/lib.rs` to register native VTE commands/events only on Linux builds and fail safely to the existing `xterm` path elsewhere.
- [x] 2.3 Implement native lease lifecycle in Rust for open, focus, resize, close, and active-panel switch; do not allow Ghostty, external windows, or multi-panel concurrency.

## Phase 3: React/manager integration

- [x] 3.1 RED: extend `src/components/__tests__/TerminalTTY.test.js` for probe success, probe failure without xterm churn, open-failure fallback, and active-panel-only bridge dispatch.
- [x] 3.2 GREEN: update `src/components/TerminalTTY.jsx` to probe before attach, render a same-window native placeholder, lease one active native panel, and recover in place to the current `xterm` session on any failure.
- [x] 3.3 Update `src/components/TerminalWorkspacesManager.jsx` to reuse TERM-02 requested/reset flow, preserve stored `vte-experimental` intent, and close/reopen the single native lease on panel switch only.

## Phase 4: Verification and evidence

- [x] 4.1 Add integration coverage in `src/components/__tests__/TerminalTTY.test.js` for native event re-dispatch, visible recovery action resetting request to `xterm`, and same-session fallback continuity.
- [x] 4.2 Update `docs/25_Terminal_Renderer_Robusto_Roadmap.md` with a TERM-03 evidence checklist: in-panel prompt, focus/input, resize, panel switch, close, runtime fallback, and explicit no-Ghostty/no-external-window/no-multi-panel guardrails.
- [x] 4.3 Capture Linux/Tauri manual-QA proof for `openspec/changes/term-03-gtk-vte-native-spike/verify-report.md`: screenshots/logs showing same-window GTK VTE plus hard `xterm` fallback after unsupported or failed native attach.

## Phase 5: Standalone GTK/VTE diagnostic harness

- [x] 5.1 RED: add small Rust/script tests around `src-tauri/src/bin/gtk_vte_smoke.rs` and `scripts/native-vte-smoke.cjs` helpers so the harness stays diagnostic-only, reuses supported env shaping, and does not touch renderer/product state.
- [x] 5.2 GREEN: create `src-tauri/src/bin/gtk_vte_smoke.rs`, `scripts/native-vte-smoke.cjs`, and `package.json` wiring for `npm run native:vte-smoke`; harness may open a separate GTK window and MUST stay outside TERM-03 product flow.
- [ ] 5.3 Validate the supported native workflow on Linux with the project-local pkg-config strategy, then capture pass/fail notes for open, prompt, type, resize, and clean close in `openspec/changes/term-03-gtk-vte-native-spike/verify-report.md` or a linked evidence section.
- [x] 5.4 Record harness interpretation in `openspec/changes/term-03-gtk-vte-native-spike/apply-progress.md`: pass means proceed to in-app attach only; fail means stop and fix/reject GTK/VTE stack before deeper Tauri work.

## Phase 6: Main-thread registry attach slice

- [x] 6.1 RED: add `src-tauri/src/native_vte.rs` tests proving `NativeVteState` stays metadata-only, lease transitions stay single-panel, and non-active panels are rejected without storing live GTK/VTE widgets in `tauri::State<T>`.
- [x] 6.2 GREEN: refactor `src-tauri/src/native_vte.rs` and `src-tauri/src/lib.rs` so Linux-only live GTK/VTE objects move into a main-thread registry/singleton while `State<T>` keeps only active-panel/lease metadata.
- [x] 6.3 RED: add targeted Rust validation for `open/focus/resize/close` routing through `run_on_main_thread`, including stale-panel rejection and close-before-reopen behavior on active-panel switch.
- [x] 6.4 GREEN: implement main-thread command routing in `src-tauri/src/native_vte.rs` so `open/focus/resize/close` operate only through the registry, attach in-window GTK/VTE for the leased active panel, and keep live `xterm` until native open succeeds.
- [x] 6.5 Stabilize Linux native tooling in `scripts/tauri-cli.cjs` by injecting project-local `PKG_CONFIG_PATH=/usr/lib/x86_64-linux-gnu/pkgconfig:/usr/share/pkgconfig:${existing}` defaults for `npm run tauri:dev` when not already present.
- [x] 6.6 Extend `src/components/__tests__/TerminalTTY.test.js`, `src/lib/terminal/nativeVteBridge.js`, and `src/components/terminal/terminalRendererCapabilities.js` coverage for real attach-path blocker normalization, active-panel-only routing, and no-xterm-remount fallback continuity after registry errors.
- [x] 6.7 RED/GREEN: fix the JS→Tauri command argument seam so every native VTE bridge call sends `{ request: payload }`, proving the Rust `request` argument is actually reached and no longer normalized into generic `probe-failed`.
- [x] 6.8 RED/GREEN: constrain native GTK overlay hit-testing to the terminal rectangle so visible GTK/VTE input does not block clicks across the rest of DevHub.
- [x] 6.9 RED/GREEN: preserve Tauri's undecorated Linux resize-handler webview parent-chain by mounting the GTK overlay directly under the GTK window, preventing outside-click crashes after native VTE attach.
- [x] 6.10 RED/GREEN: preserve an opened native GTK/VTE lease across inactive workspace/panel transitions by hiding/showing the GTK layout instead of closing/reopening the VTE shell, avoiding reload churn on workspace switch.
- [x] 6.11 RED/GREEN: observe the native terminal placeholder with `ResizeObserver` so split/panel geometry changes resize the GTK/VTE surface even when the browser window size does not change.
- [x] 6.12 RED/GREEN: make GTK VTE the default renderer, simplify the renderer switch labels/order, and keep explicit xterm as the recovery override.
- [x] 6.13 RED/GREEN: prevent V1/V2 view switches from respawning the native shell by hiding the native lease on React unmount and reusing the live Rust registry panel on reopen; explicit close still closes the native lease.
- [x] 6.14 RED/GREEN: align native VTE colors with the DevHub surface/accent palette and force GTK layout resize queueing after bounds updates.
- [ ] 6.15 Re-run focused TERM-03 verification and refresh `openspec/changes/term-03-gtk-vte-native-spike/verify-report.md` plus Linux/Tauri manual evidence with same-window screenshots/logs for in-panel attach, focus/input, resize, panel switch, close, and forced-failure hard fallback.
