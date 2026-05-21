# Apply Progress: TERM-03 GTK VTE Native Spike

**Change**: `term-03-gtk-vte-native-spike`
**Project**: `devhub`
**Mode**: Strict TDD
**Scope**: Verify-gap closure + native toolchain continuation + standalone GTK/VTE smoke harness + native spawn crash fix + in-app same-window host preparation + probe/open contract split + Phase 6 main-thread registry attach slice + surgical probe-gate fixes

## Completed Verify-Gap Work

- [x] Added missing strict-TDD apply-progress evidence for TERM-03.
- [x] Fixed the three verify-reported red suites:
  - `src/components/workspace/__tests__/WorkspaceBridgePane.test.jsx`
  - `src/components/__tests__/TerminalWorkspacesManager.shortcuts.test.jsx`
  - `src/components/__tests__/TerminalWorkspacesManager.split-layout.test.jsx`
- [x] Added direct TERM-03 proof tests for native focus, native resize, no-external-window guardrail, and no-Ghostty guardrail.
- [x] Fixed fallback xterm interactivity when `vte-experimental` is requested but GTK VTE is not ready.
- [x] Added direct fallback-focus regression coverage proving the shell re-focuses xterm only in fallback mode.
- [x] Fixed renderer selector UX/state so workspace default and active-panel override are visibly differentiated and the panel selector exposes raw `inherit`.
- [x] Added regression coverage for inherited panel selection, explicit override independence, and visible selector differentiation.
- [x] Hardened Tauri dev bootstrap so Next readiness waits for a real HTTP-successful `/` route instead of a raw TCP-open port.

## Completed Native Continuation Work

- [x] Verified the Linux/Tauri Rust toolchain really works when cargo preserves `PKG_CONFIG_PATH=/usr/lib/x86_64-linux-gnu/pkgconfig:/usr/share/pkgconfig:$PKG_CONFIG_PATH`.
- [x] Added strict-TDD Rust helper coverage for native shell-script generation and bounds→grid derivation in `src-tauri/src/native_vte.rs`.
- [x] Reworked `src-tauri/src/native_vte.rs` so probe/open now exercise real same-window GTK/Tauri access (`gtk_window`, `default_vbox`, `with_webview(...inner())`) instead of scaffold-only `ready: true` behavior.
- [x] Added direct React-side regression coverage proving the native open payload forwards `cwd` and `initialCommand` for real GTK/VTE shell startup attempts.
- [x] Proved the current next blocker is architectural, not toolchain-related: Tauri managed state requires `Send + Sync`, but live GTK/VTE widgets are main-thread-only and cannot be stored in `State<T>`.

## Completed Phase 5 Main-Thread Registry Work

- [x] Added strict-TDD Rust coverage proving `NativeVteState` stays metadata-only, active-panel lease transitions remain single-panel, metadata helpers do not store GTK/VTE widgets, and non-active panels are rejected before UI-thread routing.
- [x] Replaced the fake TERM-03 blocker path with a Linux-only `thread_local!` GTK/VTE registry that owns live overlay/layout/terminal objects on the main thread while `NativeVteState` keeps only `active_panel_id` metadata.
- [x] Routed native `open/focus/resize/close` commands through `run_on_main_thread`, with deterministic panel-lease validation before registry access.
- [x] Switched native open from “architectural blocker only” to a real same-window attach path using a GTK overlay/layout layered into the Tauri window `default_vbox`, spawning a real VTE shell inside the active panel bounds.
- [x] Stabilized the supported Tauri workflow by prepending project-local Linux `PKG_CONFIG_PATH` defaults inside `scripts/tauri-cli.cjs`, then validated Rust tests through that wrapper env without manual shell exports.
- [x] Extended JS coverage so registry attach failures normalize to stable fallback reasons, active-panel routing errors stay recoverable, and the existing xterm instance remains mounted when native attach fails.

## Completed Surgical Probe-Gate Fix

- [x] Verified the new blocker is pre-open and probe-specific: the runtime was stopping at `probe-failed`, not `open-failed`, because `native_vte_probe` and `native_vte_open` both depended on the same brittle readiness gate.
- [x] Added strict-TDD Rust coverage proving probe readiness should accept a usable same-window host without requiring `webview.inner().parent().is_some()`.
- [x] Relaxed `verify_same_window_access()` so probe/open now require only the Tauri main window, `default_vbox`, and an accessible visible webview — not a transient parent relationship that the registry attach path is supposed to create/fix.

## Completed React-Side Probe Retry Stabilization

- [x] Verified the remaining runtime gap lived in React timing: startup `probe-failed` could still queue retries too early or miss an immediate focus-driven re-probe after the host became ready.
- [x] Kept the existing failing-first `TerminalTTY` retry tests and fixed `src/components/TerminalTTY.jsx` so bounded retries stay `probe-failed`-only, replace slower pending timers with faster focus/visibility retries, and stop cleanly after successful open or stronger native failures.
- [x] Re-ran the focused `TerminalTTY` suite green after the retry scheduling fix, proving native open advances on focus after early probe failure without introducing extra retry churn.

## Completed Hidden-Webview Probe Handshake Relaxation

- [x] Verified the remaining honest blocker is still pre-open in Rust: probe/open were both treating `webview.inner().is_visible()` as mandatory readiness, even though the same-window host handle can exist before the webview flips visible during startup.
- [x] Added failing-first Rust coverage proving probe should accept an accessible webview handle even while visibility is still false, and should still reject genuinely missing webview access.
- [x] Relaxed Rust probe/open host classification so handle availability, not early webview visibility, decides whether the native path can advance past `probe-failed` toward the real attach/open logic.

## Completed Standalone GTK/VTE Smoke Harness Slice

- [x] Switched to the new layered strategy: isolate GTK/VTE first, then use that evidence to choose the next in-app slice instead of pushing deeper at the same integration seam.
- [x] Added failing-first JS wrapper tests and Rust binary helper tests for a diagnostic-only standalone harness that stays outside renderer/product state.
- [x] Created `src-tauri/src/bin/gtk_vte_smoke.rs` as a tiny GTK window + VTE shell harness plus `scripts/native-vte-smoke.cjs` and `npm run native:vte-smoke` so Linux smoke runs reuse the supported pkg-config workflow.
- [x] Recorded the interpretation rule in artifacts: harness pass means proceed inward to same-window Tauri attach; harness fail means stop and fix/reject GTK/VTE stack before deeper app integration.

## Completed Native Spawn Crash Fix

- [x] Verified the standalone harness crash was a real native spawn blocker, not GTK window setup: `zoha-vte 0.6.0` panics if `spawn_sync()` gets `child_setup: None` because the binding still forwards a non-null `child_setup_data` pointer.
- [x] Added failing-first Rust coverage in both the standalone harness and in-app native path proving the spawn wrapper now always supplies a no-op `child_setup` callback instead of `None`.
- [x] Applied the same minimal fix consistently to `src-tauri/src/bin/gtk_vte_smoke.rs` and `src-tauri/src/native_vte.rs`, preserving the real native path while removing the VTE assertion/panic trigger.

## Completed In-App Same-Window Host Preparation Slice

- [x] Used the standalone GTK/VTE PASS as the new diagnostic boundary: the remaining blocker is now the Tauri same-window host preparation path, not GTK/VTE viability or shell spawn itself.
- [x] Reworked probe/open preparation in `src-tauri/src/native_vte.rs` so the in-app path now preps/ensures the real GTK overlay host in the Tauri window during probe/open, instead of only checking a brittle webview-access heuristic.
- [x] Added failing-first Rust coverage for overlay-host acceptance and kept the in-app prep path local to same-window integration without touching fallback semantics or broad product lifecycle behavior.

## Completed Probe/Open Contract Split

- [x] Verified the remaining blocker was contractual, not GTK viability: probe was still mutating the same-window host hierarchy by calling the same prep path as open, which could keep runtime stuck on `probe-failed` before the real attach path got a fair chance.
- [x] Split probe from open in `src-tauri/src/native_vte.rs`: probe now only inspects existing same-window primitives (`main` window, `default_vbox`, existing overlay/children) while open keeps the mutating `prepare_same_window_host(...)` step.
- [x] Added focused Rust coverage proving probe accepts existing usable primitives without needing prep, while open-prep still accepts existing overlay or real vbox children for the actual attach path.

## Completed Dev Runtime Re-entry Stabilization

- [x] Verified the next blocker was no longer native probe semantics but dev-runtime re-entry noise: `npm run tauri:dev` was re-running `beforeDevCommand` against an already-live Next server on `3100`, then misclassifying the already-running sidecar on `4000`, which kept manual QA stuck behind `EADDRINUSE` instead of real TERM-03 behavior.
- [x] Added failing-first wrapper coverage and updated `scripts/tauri-cli.cjs` so `tauri:dev` probes `build.devUrl` first and injects a temporary Tauri config override that disables `beforeDevCommand` only when the existing dev server is already HTTP-ready.
- [x] Added failing-first Rust coverage and updated `src-tauri/src/lib.rs` so runtime-process detection also recognizes the live sidecar listener when the OS reports it as `MainThread`, allowing cleanup/readoption to work and letting `tauri:dev` relaunch only the stale sidecar instead of tripping over port `4000`.
- [x] Re-ran honest `npm run tauri:dev` after both fixes and confirmed the runtime now reaches a stable state with Next reused on `3100` and a fresh sidecar listening cleanly on `127.0.0.1:4000`; actual same-window GTK/VTE UI evidence is still the remaining manual proof step.

## Completed Direct-Webview Host Access Slice

- [x] Verified the next remaining blocker hypothesis lives in GTK host discovery itself: probe/open still derived readiness mostly from `default_vbox.children()`/overlay heuristics even though Tauri can expose a direct Linux `webkit2gtk::WebView` handle on the main thread.
- [x] Added failing-first Rust coverage proving both probe and open-prep should accept a usable direct webview handle even when `default_vbox.children()` is not yet the decisive signal.
- [x] Added a Linux-only `with_main_webview_access(...)` helper and rewired `inspect_same_window_host(...)` / `prepare_same_window_host(...)` to evaluate host readiness while holding the real `with_webview(...).inner()` handle on the GTK main thread.
- [x] Updated `ensure_native_host(...)` so first-time overlay creation can reuse the direct webview widget handle instead of relying only on `default_vbox.children().last()`, while still falling back honestly when the direct handle is unavailable.
- [x] Kept registry ownership and hard xterm fallback unchanged; this slice only strengthens the source of truth for same-window host accessibility and should let runtime move from false early `probe-failed` toward either real attach success or the next honest `open-failed` blocker.

## Completed Probe Diagnostic Reason Slice

- [x] Verified the next blocker was observability, not another semantic host change: runtime still collapsed all early probe failures into coarse `probe-failed`, leaving manual QA blind about which GTK/Tauri primitive was missing.
- [x] Added failing-first Rust coverage plus JS contract coverage so probe-specific diagnostics can stay explicit through the bridge/runtime capability path instead of being normalized back to generic `probe-failed`.
- [x] Refined Rust probe reasoning to emit stable reason codes for specific missing sub-checks: `probe-missing-main-window`, `probe-missing-default-vbox`, `probe-missing-webview-handle`, and `probe-missing-host-primitives`.
- [x] Updated `nativeVteBridge.js` and `terminalRendererCapabilities.js` so these specific probe reasons survive normalization and still render sane fallback copy without touching React lifecycle behavior.
- [x] Kept fallback semantics honest: probe still fails, xterm still stays live, but the next manual rerun can now tell us exactly which sub-check is failing instead of collapsing everything into one opaque bucket.

## Completed JS→Tauri Request Wrapper Fix

- [x] Re-ran `npm run tauri:dev` and selected/preserved `GTK VTE (experimental)` for panel `p57`; before this fix the runtime still logged `native VTE probe result {"ready":false,"reason":"probe-failed"}` even though Rust had specific probe reasons available.
- [x] Identified the real seam bug: `src/lib/terminal/nativeVteBridge.js` called `invoke('native_vte_probe', payload)`/`invoke('native_vte_open', payload)` while the Rust commands accept a named `request` argument, so Tauri rejected/misdeserialized the command args and the bridge normalized that into the old generic `probe-failed`.
- [x] Added failing-first bridge coverage proving all native VTE commands (`probe`, `open`, `focus`, `resize`, `close`) must wrap payloads as `{ request: payload }` before crossing into Tauri.
- [x] Updated the bridge to send `{ request }` for every native VTE command and added temporary runtime diagnostics in `TerminalTTY.jsx` to log the actual probe response during manual QA.
- [x] Confirmed in the live Tauri dev app that the same panel now logs `native VTE probe result {"ready":true,"reason":null}` and subsequent viewport diagnostics report `effectiveRendererMode:"vte-experimental"`, which means the bridge reached Rust, probe passed, and native open returned success instead of falling back to xterm.
- [x] Focused JS verification passed: `npm test -- --runTestsByPath src/lib/terminal/__tests__/nativeVteBridge.test.js src/components/__tests__/terminalRendererCapabilities.test.js src/components/__tests__/TerminalTTY.test.js` (`65/65`).

## Completed Native Overlay Hit-Test Containment Slice

- [x] User confirmed the in-app GTK/VTE terminal is now visible and accepts input, but clicking the native terminal blocked interaction with the rest of DevHub.
- [x] Identified the next blocker as GTK overlay hit-testing, not probe/open/fallback: the native `gtk::Layout` overlay was sized from `(0,0)` to `x + width` / `y + height`, so it could intercept clicks across most of the webview and app chrome.
- [x] Added focused Rust coverage for native layout geometry so the GTK event region is derived as exactly the terminal rectangle (`margin_start=x`, `margin_top=y`, `width=terminal width`, `height=terminal height`) instead of a full-window-ish layout.
- [x] Updated `apply_terminal_bounds(...)` in `src-tauri/src/native_vte.rs` so the layout overlay is aligned to the terminal bounds with margins, the terminal is positioned at `(0,0)` inside that layout, and pointer interception should be constrained to the actual terminal region.
- [x] Focused Rust verification passed with the Homebrew VTE pkg-config env: `cargo test native_vte_ -- --nocapture` (`18/18`).

## Completed Tauri Undecorated Resize Parent-Chain Crash Fix

- [x] User confirmed the hit-test containment fix allowed clicks outside the terminal, but those outside clicks closed/crashed DevHub.
- [x] Captured the crash in `npm run tauri:dev`: `tauri-runtime-wry ... undecorated_resizing.rs:546:57 called Result::unwrap() on an Err value: Widget { ... type: GtkBox }`, triggered by Tauri's Linux undecorated resize handler on `webkit2gtk::WebView` button press.
- [x] Identified the parent-chain cause: wrapping the webview with `gtk::Overlay` inside Tauri's `default_vbox` changed the webview ancestry from `WebView -> GtkBox -> GtkWindow` to `WebView -> Overlay -> GtkBox`, while Tauri's handler unwraps `webview.parent().parent()` as `gtk::Window`.
- [x] Updated first-time native host creation so the overlay becomes the direct child of the GTK window and the webview becomes the direct child of that overlay (`WebView -> Overlay -> GtkWindow`), preserving Tauri's grandparent expectation while still allowing VTE as an overlay child.
- [x] Re-ran focused Rust validation: `cargo test native_vte_ -- --nocapture` (`18/18`) and relaunched `npm run tauri:dev`; app reached a stable running state again with the patched hierarchy.

## Files Touched

| File | Action | What changed |
|---|---|---|
| `src/components/workspace/__tests__/WorkspaceBridgePane.test.jsx` | Modified | Added local fetch safety stub/restore so proxy-preview tests run deterministically without poisoning later suites. |
| `src/components/__tests__/TerminalWorkspacesManager.shortcuts.test.jsx` | Modified | Added a narrow `FileExplorerEditorPane` test mock to avoid unrelated `react-markdown` ESM parsing during shortcut coverage. |
| `src/components/__tests__/TerminalWorkspacesManager.split-layout.test.jsx` | Modified | Added the same narrow editor-pane mock so split-layout coverage stays on layout behavior only. |
| `src/components/TerminalTTY.jsx` | Modified | Added a surgical viewport-shell mouse-down focus handoff, then stabilized bounded native probe retry scheduling so focus/visibility events can re-probe early `probe-failed` startup states without extra churn. |
| `src/components/__tests__/TerminalTTY.test.js` | Modified | Added direct assertions for native focus + resize dispatch, explicit guardrails for no external window and no Ghostty/native seam crossover, plus retry-timing coverage for early `probe-failed` recovery and no re-probe after `open-failed`. |
| `src/components/__tests__/terminalRendererCapabilities.test.js` | Modified | Added explicit TERM-03 exclusion coverage proving Ghostty stays fallback-only even when Linux GTK VTE is ready. |
| `src/components/TerminalWorkspacesManager.jsx` | Modified | Switched the panel renderer selector to the raw per-panel preference, surfaced visible labels for workspace default vs panel override, and added `inherit` as an explicit panel option. |
| `src/components/terminal/terminalRendererPreferences.js` | Modified | Added a helper to read raw panel preference state so UI can distinguish inherited panels from resolved effective renderer. |
| `src/components/__tests__/TerminalWorkspacesManager.panel-subtabs.test.jsx` | Modified | Added UX/state regression coverage for visible selector differentiation, inherited panel behavior, and explicit override independence. |
| `src/components/__tests__/terminalRendererPreferences.test.js` | Modified | Added unit coverage for raw panel preference lookup so inherit remains visible in the panel selector. |
| `src-tauri/src/lib.rs` | Modified | Replaced TCP-only Next readiness with a root-route HTTP status probe and added small unit coverage for status parsing/readiness semantics. |
| `src-tauri/src/native_vte.rs` | Modified | Added tested native shell/grid helpers, upgraded probe/open to verify real Linux same-window GTK/WebKit access, and converted the old fake-open path into an explicit architectural blocker reason when real live widget state would require non-`Send` GTK objects inside Tauri state. |
| `src-tauri/Cargo.toml` | Modified | Added explicit Rust deps needed by the Linux/Tauri same-window probe path (`glib`, `libc`, `gtk`, `webkit2gtk`) after validating cargo with the fixed pkg-config environment. |
| `src/components/__tests__/TerminalTTY.test.js` | Modified | Added a native payload regression proving TERM-03 forwards `cwd` and `initialCommand` into the native open seam for real shell startup attempts. |
| `src-tauri/src/native_vte.rs` | Modified | Added a Linux-only main-thread registry, metadata helpers, real GTK overlay/layout attach, VTE spawn/focus/resize/close routing, and Rust tests for metadata-only state plus main-thread job execution. |
| `src-tauri/Cargo.toml` | Modified | Added `zoha-vte` to match the GTK 3 stack already used by Tauri and enable real in-window VTE spawning. |
| `scripts/tauri-cli.cjs` | Modified | Prepends Debian-style Linux pkg-config paths while keeping the existing `/usr/bin/pkg-config` fallback selection logic. |
| `tests/unit/tauri-cli.test.js` | Modified | Added RED/GREEN coverage for pkg-config path injection and existing-path preservation. |
| `src/lib/terminal/nativeVteBridge.js` | Modified | Normalizes registry attach/runtime errors into stable `probe-failed`/`open-failed`/panel-active reasons for React fallback handling. |
| `src/lib/terminal/__tests__/nativeVteBridge.test.js` | Modified | Added regression proving unknown registry attach failures normalize to `open-failed`. |
| `src/components/terminal/terminalRendererCapabilities.js` | Modified | Added explicit `panel-not-active` fallback semantics/copy while preserving requested/effective renderer split. |
| `src/components/__tests__/terminalRendererCapabilities.test.js` | Modified | Added active-panel registry fallback coverage for `panel-not-active`. |
| `src/components/__tests__/TerminalTTY.test.js` | Modified | Added no-remount fallback continuity coverage for registry routing rejection. |
| `src-tauri/src/native_vte.rs` | Modified | Replaced the brittle webview-parent probe heuristic with a smaller same-window host readiness contract and added Rust tests for the new probe semantics. |
| `src-tauri/src/native_vte.rs` | Modified | Relaxed same-window probe/open classification so accessible webview handles count even before `is_visible()` flips true during startup; added Rust regression coverage for hidden-handle acceptance vs genuinely missing handle rejection. |
| `src-tauri/src/bin/gtk_vte_smoke.rs` | Created | Added a diagnostic-only standalone GTK window + VTE shell harness with minimal arg parsing, shell spawn helpers, child-exit logging, and close cleanup outside product renderer flow. |
| `src-tauri/src/bin/gtk_vte_smoke.rs` | Modified | Replaced `spawn_sync(..., None, ...)` with a no-op `child_setup` wrapper so the harness avoids the `zoha-vte` assertion/panic path; added regression coverage for callback presence. |
| `scripts/native-vte-smoke.cjs` | Created | Added a supported wrapper that reuses `buildTauriEnv()` and runs `cargo run --bin gtk_vte_smoke -- ...` from `src-tauri`. |
| `package.json` | Modified | Added `npm run native:vte-smoke` for the standalone harness workflow. |
| `tests/unit/native-vte-smoke.test.js` | Created | Added unit coverage for harness wrapper args/env/cwd routing. |
| `tests/unit/package-scripts.test.js` | Modified | Added coverage that the new harness command is exposed as a supported script. |
| `src-tauri/src/native_vte.rs` | Modified | Wrapped native `spawn_sync()` in a no-op `child_setup` helper so the real in-app GTK/VTE attach path avoids the same `zoha-vte` assertion/panic; added regression coverage for callback presence. |
| `src-tauri/src/native_vte.rs` | Modified | Replaced probe/open's old same-window access gate with `prepare_same_window_host(...)`, which ensures/accepts the real GTK overlay host inside the Tauri window before native open proceeds. |
| `src-tauri/src/native_vte.rs` | Modified | Split probe from open so probe now only inspects existing same-window host primitives via `inspect_same_window_host(...)`, while open alone performs mutating host preparation. |
| `scripts/tauri-cli.cjs` | Modified | Added dev-url probing and a temporary Tauri config override so `tauri:dev` skips `beforeDevCommand` when the existing Next dev server is already HTTP-ready on `3100`. |
| `tests/unit/tauri-cli.test.js` | Modified | Added RED/GREEN coverage for dev-url reuse, config override injection, and the unchanged non-dev CLI path. |
| `src-tauri/src/lib.rs` | Modified | Added `is_devhub_runtime_process(...)` so port cleanup/sidecar adoption recognize `MainThread`-reported sidecar listeners and stop false `EADDRINUSE:4000` relaunch failures during manual QA. |
| `src-tauri/src/native_vte.rs` | Modified | Added direct-webview main-thread access via `with_main_webview_access(...)`, widened probe/open-prep readiness to accept a usable direct webview handle, and let first-time overlay creation reuse that direct widget instead of depending only on `default_vbox.children().last()`. |
| `src-tauri/src/native_vte.rs` | Modified | Replaced coarse probe failure collapse with stable diagnostic reason codes for missing main-window/default-vbox/webview-handle/host-primitives states. |
| `src/lib/terminal/nativeVteBridge.js` | Modified | Preserves specific probe diagnostic reason codes instead of collapsing them to generic `probe-failed`. |
| `src/components/terminal/terminalRendererCapabilities.js` | Modified | Added user-visible fallback copy for the new specific probe diagnostic reasons while preserving xterm fallback behavior. |
| `src/lib/terminal/__tests__/nativeVteBridge.test.js` | Modified | Added RED/GREEN coverage proving specific probe diagnostics survive bridge normalization. |
| `src/components/__tests__/terminalRendererCapabilities.test.js` | Modified | Added RED/GREEN coverage proving specific probe diagnostics survive capability selection and fallback copy. |

## TDD Cycle Evidence

| Task | Test File | Layer | Safety Net | RED | GREEN | TRIANGULATE | REFACTOR |
|---|---|---|---|---|---|---|---|
| VG-1 Fix WorkspaceBridgePane verify-reported failures | `src/components/workspace/__tests__/WorkspaceBridgePane.test.jsx` | Integration | ✅ Reproduced 9 failing tests in target suite | ✅ Added fetch stub/restore expected to fail without fix | ✅ Suite passed `20/20` after fix | ✅ Covered proxy preload, inspect activation, proxy escape, same-origin fallback | ➖ Test-only cleanup; no production refactor needed |
| VG-2 Unblock shortcut suite from editor-pane markdown ESM parse | `src/components/__tests__/TerminalWorkspacesManager.shortcuts.test.jsx` | Integration | ✅ Reproduced suite boot failure on `react-markdown` parse | ✅ Added narrow seam mock before rerun | ✅ Suite passed `9/9` | ✅ Existing shortcut cases cover wrap, adjacency, hidden-state, editable-focus, split/close behaviors | ➖ No production refactor needed |
| VG-3 Unblock split-layout suite from editor-pane markdown ESM parse | `src/components/__tests__/TerminalWorkspacesManager.split-layout.test.jsx` | Integration | ✅ Reproduced suite boot failure on `react-markdown` parse | ✅ Added narrow seam mock before rerun | ✅ Suite passed `2/2` | ✅ Existing layout cases cover horizontal and vertical split paths | ➖ No production refactor needed |
| VG-4 Add direct TERM-03 native lifecycle proof | `src/components/__tests__/TerminalTTY.test.js` | Integration | ✅ Baseline suite passed `40/40` before edits | ✅ Added assertions/tests for focus, resize, no external window, no Ghostty seam | ✅ Strengthened suite passed `44/44` | ✅ Separate cases now prove active focus, window resize dispatch, same-window guardrail, Ghostty exclusion | ➖ Test-only strengthening |
| VG-5 Add explicit TERM-03 no-Ghostty capability guardrail | `src/components/__tests__/terminalRendererCapabilities.test.js` | Unit | ✅ Baseline suite passed in TERM-03 focused run | ✅ Added Ghostty exclusion case first | ✅ Suite passed `8/8` | ✅ Case proves Linux/Tauri/VTE readiness does not make Ghostty effective | ➖ Test-only strengthening |
| VG-6 Restore fallback xterm interactivity when GTK VTE is not ready | `src/components/__tests__/TerminalTTY.test.js` | Integration | ✅ Baseline suite passed `44/44` before fallback edit | ✅ Added failing fallback-focus test first | ✅ Suite passed `45/45` after shell focus handoff | ✅ Added companion case proving native-active mode does not steal focus back into xterm | ✅ Minimal callback only; no further refactor needed |
| VG-7 Expose raw inherit state in panel renderer selector | `src/components/__tests__/terminalRendererPreferences.test.js` | Unit | ✅ Safety net passed `5/5` before edits | ✅ Added failing raw-preference lookup test first | ✅ Suite passed `6/6` after helper export | ✅ Covers inherit, explicit override, and missing-panel fallback | ➖ No refactor needed |
| VG-8 Clarify workspace default vs panel override renderer controls | `src/components/__tests__/TerminalWorkspacesManager.panel-subtabs.test.jsx` | Integration | ✅ Safety net passed `18/18` before edits | ✅ Added failing visible-label + inherit UI tests first | ✅ Suite passed `21/21` after selector UI/state fix | ✅ Covers inherited panel behavior, explicit override independence, and visible differentiation between both selectors | ✅ Small JSX restructuring only; no lifecycle churn |
| VG-9 Gate Tauri dev bootstrap on HTTP-ready Next root route | `src-tauri/src/lib.rs` | Unit | ⚠️ `cargo test nextjs_readiness -- --nocapture` blocked pre-change by missing system GTK/WebKit pkg-config libs (`libsoup-3.0`, `javascriptcoregtk-4.1`, `webkit2gtk-4.1`) | ✅ Added failing-first route-readiness semantics via new status parsing/root-route helper tests | ⚠️ Cargo test remains environment-blocked after code change for same missing native libs | ✅ Added second case proving only 2xx/3xx HTTP statuses count as ready and readiness path explicitly targets `/` | ➖ No further refactor needed |
| NV-1 Prove cargo really works with corrected pkg-config env | `src-tauri/src/lib.rs` | Unit | ✅ Safety net reran readiness tests with env-fixed cargo command | ✅ Re-executed the previously blocked command first with the corrected env | ✅ `cargo test nextjs_readiness -- --nocapture` passed `3/3` | ➖ Single environment-validation behavior; triangulation not applicable | ➖ No refactor needed |
| NV-2 Add Rust helper coverage for native shell/grid derivation | `src-tauri/src/native_vte.rs` | Unit | N/A (new file under test) | ✅ Added failing tests first for shell quoting, shell script composition, and bounds→grid math | ✅ `cargo test native_vte_ -- --nocapture` passed `5/5` after helper implementation | ✅ Covered quoted cwd, explicit command launch, login-shell fallback, normal bounds sizing, and minimum grid sizing | ✅ Kept helpers pure and isolated |
| NV-3 Prove React forwards real native startup payload | `src/components/__tests__/TerminalTTY.test.js` | Integration | ✅ Safety net passed `45/45` before edits | ✅ Added failing native payload-forwarding case first | ✅ Suite passed `46/46` after test+seam confirmation | ✅ Existing native-open cases still cover focus, resize, no-external-window, runtime fallback, and active-panel lease boundaries | ➖ No production refactor needed |
| NV-4 Push native Rust probe/open past scaffold and surface the real blocker | `src-tauri/src/native_vte.rs` | Unit | ✅ Safety net passed `5/5` helper tests + `3/3` readiness tests before blocker iteration | ✅ Replaced fake-open assumptions with real Linux GTK/Tauri access checks first, then drove helper assertions from compile/test failures | ✅ Final cargo runs pass while code now returns explicit blocker evidence instead of fake success | ✅ Triangulated across probe access, open payload construction, and multiple compile attempts including the failed non-`Send` GTK-state design | ✅ Refactored back to a compiling blocker artifact once the architecture constraint was proven |
| P5-1 Prove native metadata stays outside `State<T>` | `src-tauri/src/native_vte.rs` | Unit | ✅ Safety net passed `5/5` native helper tests before edits | ✅ Added failing metadata/lease tests for snapshot, active-panel rejection, and single-panel open plan first | ✅ `cargo test native_vte_ -- --nocapture` passed `10/10` after metadata helpers + registry routing landed | ✅ Covers empty metadata, set/clear metadata, same-panel reopen, active-panel switch, and non-active rejection | ✅ Extracted metadata helpers and main-thread executor seam |
| P5-2 Move live GTK/VTE ownership into main-thread registry | `src-tauri/src/native_vte.rs` | Unit | ✅ Safety net reused the same `5/5` native helper baseline | ✅ Tests referenced registry-safe helpers before implementation existed | ✅ Real Linux registry attach path compiles and the expanded native suite passes `10/10` | ✅ Triangulated across overlay/layout host creation, VTE spawn argv generation, metadata-only state, and panel lease switching | ✅ Registry isolated behind helper functions; `State<T>` remains metadata-only |
| P5-3 Validate main-thread routing for focus/resize/close | `src-tauri/src/native_vte.rs` | Unit | ✅ Safety net passed earlier native suite before routing changes | ✅ Added failing `execute_main_thread_job` and active-panel rejection tests first | ✅ Expanded native suite stayed green at `10/10` after routing implementation | ✅ Covers runner execution, stale-panel rejection, and close-before-reopen planning | ✅ Kept UI-thread hop explicit via one executor helper |
| P5-4 Implement same-window registry `open/focus/resize/close` | `src-tauri/src/native_vte.rs` | Unit | ✅ Safety net shared with native suite | ✅ Drove implementation from failing registry/routing tests and compile errors | ✅ `cargo test native_vte_ -- --nocapture` and `cargo test nextjs_readiness -- --nocapture` both pass with working pkg-config env | ✅ Triangulated across attach host lookup, spawn, bounds→grid sizing, and close/focus/resize paths | ✅ Refactored fake blocker path into real attach helpers |
| P5-5 Stabilize Tauri pkg-config env locally | `tests/unit/tauri-cli.test.js` | Unit | ✅ Safety net passed `4/4` wrapper tests before edits | ✅ Added failing injection/preservation tests first | ✅ Wrapper suite passed `6/6` after path-merge implementation | ✅ Covers empty path injection plus existing-path prepend/preserve behavior | ✅ Kept wrapper logic isolated in pure helper |
| P5-6 Preserve fallback continuity after registry errors | `src/components/__tests__/TerminalTTY.test.js`, `src/lib/terminal/__tests__/nativeVteBridge.test.js`, `src/components/__tests__/terminalRendererCapabilities.test.js` | Integration + Unit | ✅ Safety net passed `61/61` focused JS tests before edits | ✅ Added failing tests first for registry error normalization, `panel-not-active` fallback, and no-remount xterm continuity | ✅ Focused JS rerun passed `66/66` | ✅ Covers bridge normalization, capability copy/reason mapping, and same-instance xterm continuity after native rejection | ✅ No production remount churn introduced |
| P5-7 Surgical probe gate fix for same-window host readiness | `src-tauri/src/native_vte.rs` | Unit | ✅ Safety net passed `10/10` native registry tests before edits | ✅ Added failing probe-contract tests first for usable host acceptance and missing-host rejection | ✅ `cargo test native_vte_ -- --nocapture` passed `12/12` after the gate fix; `nextjs_readiness` stayed green `3/3` | ✅ Covers usable host acceptance without parent heuristic plus explicit rejection when vbox/webview access is missing | ✅ Kept the fix local to probe/open gating without broadening registry architecture |
| P5-7b Stabilize React-side re-probe timing after early `probe-failed` startup | `src/components/__tests__/TerminalTTY.test.js` | Integration | ✅ Safety net exposed the existing regression when the focused suite failed `48/49` on extra/missing probe attempts | ✅ Reused failing-first retry tests for focus-triggered re-probe and no-reprobe-after-open-fail | ✅ Focused suite passed `49/49` after retry timer replacement + immediate-event scheduling fix | ✅ Covers early delayed `probe-failed` recovery on window focus plus stronger `open-failed` stopping further retries | ✅ Extracted retry-timer clearing/replacement so event-driven retries stay bounded and deterministic |
| P5-7c Relax hidden-webview probe/open handshake without faking readiness | `src-tauri/src/native_vte.rs` | Unit | ✅ Safety net passed `12/12` native registry/probe tests before edits | ✅ Added failing-first tests for hidden-yet-accessible webview handles and missing-handle rejection | ✅ `cargo test native_vte_ -- --nocapture` passed `14/14` and `nextjs_readiness` stayed green `3/3` after classification change | ✅ Covers accessible-handle startup timing vs truly missing webview access so probe can move beyond early visibility races | ✅ Kept the change local to probe/open access classification; registry attach path unchanged |
| H-5.1 Add standalone GTK/VTE harness tests before implementation | `tests/unit/native-vte-smoke.test.js`, `tests/unit/package-scripts.test.js`, `src-tauri/src/bin/gtk_vte_smoke.rs` | Unit | ✅ Safety net was implicit on untouched harness files; existing wrapper/package tests still passed before edits | ✅ Added failing-first script exposure tests, wrapper invocation tests, and Rust helper/arg parsing tests before creating the harness | ✅ JS harness tests passed `5/5`; Rust harness tests passed `2/2` via `cargo test gtk_vte_smoke -- --nocapture` after implementation | ✅ Covers script wiring, cargo wrapper args/env/cwd routing, login-shell default, and explicit cwd/command/title parsing | ✅ Kept harness isolated as a standalone binary/wrapper with no product renderer coupling |
| H-5.2 Remove `zoha-vte` `spawn_sync(None, ...)` panic path with smallest stable fix | `src-tauri/src/bin/gtk_vte_smoke.rs`, `src-tauri/src/native_vte.rs` | Unit | ✅ Safety net was the reproduced user crash plus existing `14/14` native tests and `2/2` harness tests | ✅ Added failing-first wrapper-callback tests proving both paths must provide a `child_setup` callback | ✅ `cargo test native_vte_ -- --nocapture` passed `15/15`; `cargo test gtk_vte_smoke -- --nocapture` passed `3/3` after the no-op callback fix | ✅ Covers harness + product spawn wrapper behavior so both native paths avoid the same VTE assertion | ✅ Shared helper approach kept the fix surgical and consistent |
| I-6.1 Prepare real GTK overlay host inside Tauri same-window path before open | `src-tauri/src/native_vte.rs` | Unit | ✅ Safety net was the standalone harness PASS plus existing `15/15` native suite showing GTK/VTE viability outside Tauri | ✅ Reused and tightened failing-first host-prep tests so existing overlay host and default vbox children both count as valid prep signals while missing host primitives still fail | ✅ `cargo test native_vte_ -- --nocapture` passed `14/14` and `nextjs_readiness` stayed green `3/3` after `prepare_same_window_host(...)` replaced the older access check | ✅ Covers the in-app boundary we actually care about now: preparing/ensuring the GTK overlay host in the real Tauri window before native open | ✅ Kept the change local to same-window prep; no fallback or React lifecycle churn |
| I-6.2 Split lightweight probe inspection from mutating open preparation | `src-tauri/src/native_vte.rs` | Unit | ✅ Safety net passed `14/14` native tests before edits | ✅ Reused and extended failing-first host-primitives tests so probe acceptance stays non-mutating while open-prep acceptance remains explicit | ✅ `cargo test native_vte_ -- --nocapture` passed `15/15`; `nextjs_readiness` stayed green `3/3` after probe/open split | ✅ Covers the corrected contract: probe inspects existing usable primitives only, open performs actual host preparation | ✅ Kept the change isolated to Rust native contract; no React churn |
| I-6.3 Reuse existing Next dev server during `tauri:dev` manual QA | `tests/unit/tauri-cli.test.js`, `scripts/tauri-cli.cjs` | Unit | ✅ Safety net passed `6/6` wrapper tests before edits | ✅ Added failing-first tests for ready-dev-url config override injection and untouched fallback behavior | ✅ Focused wrapper suite passed `9/9` after the dev-url probe + override implementation | ✅ Covers ready-server reuse, non-ready no-op path, and preserved non-dev CLI execution | ✅ Kept the workaround local to the wrapper; product config remains unchanged on disk |
| I-6.4 Recognize `MainThread` sidecar listeners during cleanup/adoption | `src-tauri/src/lib.rs` | Unit | ✅ Safety net passed `3/3` `nextjs_readiness` tests before edits | ✅ Added failing-first runtime classification tests for real sidecar `MainThread` labels vs unrelated processes | ✅ `cargo test devhub_runtime_process -- --nocapture` passed `2/2`; `cargo test nextjs_readiness -- --nocapture` stayed green `3/3` after process-classification extraction | ✅ Covers real sidecar adoption/cleanup shape without widening to unrelated OS processes | ✅ Extracted a single helper so cleanup and adoption share the same classification rule |
| I-6.5 Use direct Tauri webview handle as same-window host source of truth | `src-tauri/src/native_vte.rs` | Unit | ✅ Safety net passed `15/15` native tests before edits | ✅ Added failing-first probe/open-prep tests for direct webview access without relying on `default_vbox.children()` | ✅ `cargo test native_vte_ -- --nocapture` passed `17/17`; `nextjs_readiness` stayed green `3/3` after the direct-webview host slice | ✅ Covers direct-handle probe acceptance, direct-handle open-prep acceptance, and first-time overlay creation using the real webview widget handle | ✅ Kept the change inside the Rust/native seam; registry/fallback behavior unchanged |
| I-6.6 Surface stable probe diagnostics instead of opaque `probe-failed` | `src-tauri/src/native_vte.rs`, `src/lib/terminal/nativeVteBridge.js`, `src/components/terminal/terminalRendererCapabilities.js` | Unit | ✅ Safety net passed `13/13` JS reason-handling tests and `17/17` native tests before edits | ✅ Added failing-first JS + Rust assertions for specific probe diagnostic reasons surviving the full seam | ✅ Focused JS rerun passed `15/15`; `cargo test native_vte_ -- --nocapture` stayed green at `17/17`; `nextjs_readiness` stayed green `3/3` | ✅ Covers bridge preservation, runtime capability fallback selection, user-visible fallback copy, and Rust host-primitives rejection mapping | ✅ Change stays inside native seam + reason mapping only; no React churn |

## Test Summary

- **Total tests written/strengthened**: 57 direct verify-gap/native-continuation/harness/probe-fix/runtime-reentry/direct-webview/diagnostic-reason tests or assertion expansions
- **Focused suites passing**: latest targeted reruns passed `49/49` in `TerminalTTY.test.js`, `17/17` in `native_vte_`, `3/3` in `nextjs_readiness`, `2/2` in `devhub_runtime_process`, `3/3` in `gtk_vte_smoke`, `9/9` in `tauri-cli.test.js`, `15/15` across focused JS reason-handling suites, and `5/5` in harness JS wrapper tests
- **Layers used**: Unit, Integration
- **Approval tests**: None — verify-gap closure was bugfix + proof-strengthening, not production refactor
- **Pure/helper functions created**: 14 (`build_native_shell_script`, `derive_terminal_grid`, `snapshot_native_vte_state`, `plan_native_vte_open`, `require_active_panel`, `set_active_panel_metadata`, `clear_active_panel_metadata`, `readTauriBuildConfig`, `isReadyHttpStatus`, `isDevUrlReady`, `injectArgsBeforeAppArgs`, `resolveTauriCliArgs`, `is_devhub_runtime_process`, `with_main_webview_access`)

## Tests Run

1. `npm test -- --runInBand "src/components/__tests__/TerminalTTY.test.js"`
2. `npm test -- --runInBand "src/components/workspace/__tests__/WorkspaceBridgePane.test.jsx"`
3. `npm test -- --runInBand "src/components/__tests__/TerminalWorkspacesManager.shortcuts.test.jsx"`
4. `npm test -- --runInBand "src/components/__tests__/TerminalWorkspacesManager.split-layout.test.jsx"`
5. `npm test -- --runInBand "src/components/__tests__/TerminalTTY.test.js" "src/components/__tests__/terminalRendererCapabilities.test.js"`
6. `npm test`
7. `npm test -- --runTestsByPath "src/components/__tests__/TerminalTTY.test.js"`
8. `npm test -- --runTestsByPath "src/components/__tests__/TerminalTTY.test.js"`
9. `npm test -- --runTestsByPath "src/components/__tests__/TerminalTTY.test.js" "src/components/__tests__/terminalRendererCapabilities.test.js"`
10. `npm test -- --runTestsByPath "src/components/__tests__/TerminalWorkspacesManager.panel-subtabs.test.jsx" "src/components/__tests__/terminalRendererPreferences.test.js"`
11. `npm test -- --runTestsByPath "src/components/__tests__/TerminalWorkspacesManager.panel-subtabs.test.jsx" "src/components/__tests__/terminalRendererPreferences.test.js"`
12. `npm test -- --runTestsByPath "src/components/__tests__/TerminalWorkspacesManager.panel-subtabs.test.jsx" "src/components/__tests__/terminalRendererPreferences.test.js" "src/components/__tests__/TerminalTTY.test.js"`
13. `cargo test nextjs_readiness -- --nocapture` *(blocked by missing system libraries: `libsoup-3.0`, `javascriptcoregtk-4.1`, `webkit2gtk-4.1`)*
14. `cargo test nextjs_readiness -- --nocapture` *(still blocked by same missing system libraries after readiness-gate fix)*
15. `PKG_CONFIG_PATH=/usr/lib/x86_64-linux-gnu/pkgconfig:/usr/share/pkgconfig:$PKG_CONFIG_PATH cargo test nextjs_readiness -- --nocapture`
16. `PKG_CONFIG_PATH=/usr/lib/x86_64-linux-gnu/pkgconfig:/usr/share/pkgconfig:$PKG_CONFIG_PATH cargo test native_vte_ -- --nocapture` *(red: missing helper functions)*
17. `PKG_CONFIG_PATH=/usr/lib/x86_64-linux-gnu/pkgconfig:/usr/share/pkgconfig:$PKG_CONFIG_PATH cargo test native_vte_ -- --nocapture` *(red: `zoha-vte` cairo binding mismatch + non-`Send` GTK state attempts)*
18. `PKG_CONFIG_PATH=/usr/lib/x86_64-linux-gnu/pkgconfig:/usr/share/pkgconfig:$PKG_CONFIG_PATH cargo test native_vte_ -- --nocapture` *(green: blocker artifact compiles and helper tests pass `5/5`)*
19. `npm test -- --runTestsByPath "src/components/__tests__/TerminalTTY.test.js"`
20. `PKG_CONFIG_PATH=/usr/lib/x86_64-linux-gnu/pkgconfig:/usr/share/pkgconfig:$PKG_CONFIG_PATH cargo test native_vte_ -- --nocapture` *(red: unresolved Phase-5 metadata helpers)*
21. `PKG_CONFIG_PATH=/usr/lib/x86_64-linux-gnu/pkgconfig:/usr/share/pkgconfig:$PKG_CONFIG_PATH cargo test native_vte_ -- --nocapture` *(red: unresolved `zoha-vte`/trait imports and GTK send-bound mistakes during real registry attach)*
22. `PKG_CONFIG_PATH=/usr/lib/x86_64-linux-gnu/pkgconfig:/usr/share/pkgconfig:$PKG_CONFIG_PATH cargo test native_vte_ -- --nocapture` *(green: expanded native suite passes `10/10` with registry slice)*
23. `npm test -- --runTestsByPath "src/components/__tests__/TerminalTTY.test.js" "src/lib/terminal/__tests__/nativeVteBridge.test.js" "src/components/__tests__/terminalRendererCapabilities.test.js" "tests/unit/tauri-cli.test.js"` *(red then green after tauri-cli expectation update; final rerun `66/66`)*
24. `cargo test native_vte_ -- --nocapture` *(still fails without env, proving bare cargo is not yet project-stabilized)*
25. `PKG_CONFIG_PATH=/usr/lib/x86_64-linux-gnu/pkgconfig:/usr/share/pkgconfig:$PKG_CONFIG_PATH cargo test nextjs_readiness -- --nocapture`
26. `node -e '...buildTauriEnv()...cargo test native_vte_...cargo test nextjs_readiness...'` *(green: project-local wrapper env runs both Rust suites without manual export)*
27. `PKG_CONFIG_PATH=/usr/lib/x86_64-linux-gnu/pkgconfig:/usr/share/pkgconfig:$PKG_CONFIG_PATH cargo test native_vte_ -- --nocapture` *(red: missing surgical probe-contract helper)*
28. `PKG_CONFIG_PATH=/usr/lib/x86_64-linux-gnu/pkgconfig:/usr/share/pkgconfig:$PKG_CONFIG_PATH cargo test native_vte_ -- --nocapture` *(green: expanded native suite passes `12/12` after probe gate fix)*
29. `PKG_CONFIG_PATH=/usr/lib/x86_64-linux-gnu/pkgconfig:/usr/share/pkgconfig:$PKG_CONFIG_PATH cargo test nextjs_readiness -- --nocapture`
30. `npm test -- --runTestsByPath "src/components/__tests__/TerminalTTY.test.js"` *(red: focused suite failed `48/49`; probe retry scheduling re-probed too early / missed focus-driven retry path)*
31. `npm test -- --runTestsByPath "src/components/__tests__/TerminalTTY.test.js"` *(green: focused suite passed `49/49` after retry timer replacement + immediate focus retry fix)*
32. `PKG_CONFIG_PATH=/usr/lib/x86_64-linux-gnu/pkgconfig:/usr/share/pkgconfig:$PKG_CONFIG_PATH cargo test native_vte_ -- --nocapture` *(red: new hidden-webview probe tests failed because probe/open still required visible webview state)*
33. `PKG_CONFIG_PATH=/usr/lib/x86_64-linux-gnu/pkgconfig:/usr/share/pkgconfig:$PKG_CONFIG_PATH cargo test native_vte_ -- --nocapture` *(green: expanded native suite passed `14/14` after hidden-webview access classification fix)*
34. `PKG_CONFIG_PATH=/usr/lib/x86_64-linux-gnu/pkgconfig:/usr/share/pkgconfig:$PKG_CONFIG_PATH cargo test nextjs_readiness -- --nocapture`
35. `npm test -- --runTestsByPath "tests/unit/package-scripts.test.js" "tests/unit/native-vte-smoke.test.js"` *(red: harness script missing and wrapper module absent)*
36. `PKG_CONFIG_PATH=/usr/lib/x86_64-linux-gnu/pkgconfig:/usr/share/pkgconfig:$PKG_CONFIG_PATH cargo test gtk_vte_smoke -- --nocapture` *(red: standalone harness helper symbols missing)*
37. `npm test -- --runTestsByPath "tests/unit/package-scripts.test.js" "tests/unit/native-vte-smoke.test.js"` *(green: harness wrapper/script tests passed `5/5`)*
38. `PKG_CONFIG_PATH=/usr/lib/x86_64-linux-gnu/pkgconfig:/usr/share/pkgconfig:$PKG_CONFIG_PATH cargo test gtk_vte_smoke -- --nocapture` *(red: close handler used wrong GTK return type)*
39. `PKG_CONFIG_PATH=/usr/lib/x86_64-linux-gnu/pkgconfig:/usr/share/pkgconfig:$PKG_CONFIG_PATH cargo test gtk_vte_smoke -- --nocapture` *(green: standalone harness tests passed `2/2` after delete-event return fix)*
40. `PKG_CONFIG_PATH=/usr/lib/x86_64-linux-gnu/pkgconfig:/usr/share/pkgconfig:$PKG_CONFIG_PATH cargo test native_vte_ -- --nocapture` *(red: new spawn wrapper test exposed that in-app native path still passed `child_setup: None`)*
41. `PKG_CONFIG_PATH=/usr/lib/x86_64-linux-gnu/pkgconfig:/usr/share/pkgconfig:$PKG_CONFIG_PATH cargo test gtk_vte_smoke -- --nocapture` *(red: new spawn wrapper test exposed that the harness still passed `child_setup: None`)*
42. `PKG_CONFIG_PATH=/usr/lib/x86_64-linux-gnu/pkgconfig:/usr/share/pkgconfig:$PKG_CONFIG_PATH cargo test native_vte_ -- --nocapture` *(green: native suite passed `15/15` after no-op child_setup fix)*
43. `PKG_CONFIG_PATH=/usr/lib/x86_64-linux-gnu/pkgconfig:/usr/share/pkgconfig:$PKG_CONFIG_PATH cargo test gtk_vte_smoke -- --nocapture` *(green: harness suite passed `3/3` after no-op child_setup fix)*
44. `PKG_CONFIG_PATH=/usr/lib/x86_64-linux-gnu/pkgconfig:/usr/share/pkgconfig:$PKG_CONFIG_PATH cargo test native_vte_ -- --nocapture` *(red: same-window prep refactor initially failed due to borrowed failure reason escaping UI-thread closure)*
45. `PKG_CONFIG_PATH=/usr/lib/x86_64-linux-gnu/pkgconfig:/usr/share/pkgconfig:$PKG_CONFIG_PATH cargo test native_vte_ -- --nocapture` *(green: native suite passed `14/14` after `prepare_same_window_host(...)` lifetime + host-prep refactor)*
46. `PKG_CONFIG_PATH=/usr/lib/x86_64-linux-gnu/pkgconfig:/usr/share/pkgconfig:$PKG_CONFIG_PATH cargo test nextjs_readiness -- --nocapture`
47. `PKG_CONFIG_PATH=/usr/lib/x86_64-linux-gnu/pkgconfig:/usr/share/pkgconfig:$PKG_CONFIG_PATH cargo test native_vte_ -- --nocapture` *(green after probe/open split: native suite passed `15/15` with non-mutating probe inspection + mutating open prep contract)*
48. `PKG_CONFIG_PATH=/usr/lib/x86_64-linux-gnu/pkgconfig:/usr/share/pkgconfig:$PKG_CONFIG_PATH cargo test nextjs_readiness -- --nocapture`
49. `npm test -- --runTestsByPath "tests/unit/tauri-cli.test.js"` *(green safety net: wrapper suite passed `6/6` before runtime re-entry changes)*
50. `npm test -- --runTestsByPath "tests/unit/tauri-cli.test.js"` *(red then green: suite first failed `8/9` on stale expectation after adding ready-dev-url override tests, final rerun passed `9/9`)*
51. `PKG_CONFIG_PATH=/usr/lib/x86_64-linux-gnu/pkgconfig:/usr/share/pkgconfig:$PKG_CONFIG_PATH cargo test nextjs_readiness -- --nocapture` *(green safety net after runtime classification extraction: `3/3`)*
52. `PKG_CONFIG_PATH=/usr/lib/x86_64-linux-gnu/pkgconfig:/usr/share/pkgconfig:$PKG_CONFIG_PATH cargo test devhub_runtime_process -- --nocapture` *(green: new runtime classification suite passed `2/2`)*
53. `npm run tauri:dev` *(manual runtime validation: confirmed wrapper no longer re-runs Next on occupied `3100`; first rerun exposed remaining `4000` sidecar adoption bug)*
54. `npm run tauri:dev` *(manual runtime validation after sidecar classification fix: runtime reached stable state with Next reused and fresh sidecar listening on `127.0.0.1:4000`)*
55. `PKG_CONFIG_PATH=/usr/lib/x86_64-linux-gnu/pkgconfig:/usr/share/pkgconfig:$PKG_CONFIG_PATH cargo test native_vte_ -- --nocapture` *(red: new direct-webview readiness tests failed until the host-readiness helpers accepted a real direct webview handle)*
56. `PKG_CONFIG_PATH=/usr/lib/x86_64-linux-gnu/pkgconfig:/usr/share/pkgconfig:$PKG_CONFIG_PATH cargo test native_vte_ -- --nocapture` *(green: native suite passed `17/17` after direct-webview host access slice)*
57. `PKG_CONFIG_PATH=/usr/lib/x86_64-linux-gnu/pkgconfig:/usr/share/pkgconfig:$PKG_CONFIG_PATH cargo test nextjs_readiness -- --nocapture` *(green regression: `3/3`)*
58. `npm test -- --runTestsByPath "src/lib/terminal/__tests__/nativeVteBridge.test.js" "src/components/__tests__/terminalRendererCapabilities.test.js"` *(green safety net: `13/13` before reason-slice changes)*
59. `npm test -- --runTestsByPath "src/lib/terminal/__tests__/nativeVteBridge.test.js" "src/components/__tests__/terminalRendererCapabilities.test.js"` *(green final: `15/15` after specific probe-diagnostic reason support)*
60. `PKG_CONFIG_PATH=/usr/lib/x86_64-linux-gnu/pkgconfig:/usr/share/pkgconfig:$PKG_CONFIG_PATH cargo test native_vte_ -- --nocapture` *(green: `17/17` after replacing generic probe rejection with specific diagnostic reason codes)*
61. `PKG_CONFIG_PATH=/usr/lib/x86_64-linux-gnu/pkgconfig:/usr/share/pkgconfig:$PKG_CONFIG_PATH cargo test nextjs_readiness -- --nocapture` *(green regression: `3/3`)*
62. `npm test -- --runTestsByPath src/components/__tests__/TerminalTTY.test.js --runInBand` *(red: new inactive-workspace lease-preservation test caught `closeNativeVtePanel({ reason: "inactive-panel" })` and reopen churn)*
63. `npm test -- --runTestsByPath src/components/__tests__/TerminalTTY.test.js src/lib/terminal/__tests__/nativeVteBridge.test.js --runInBand` *(green: `55/55` after preserving the native lease across inactive transitions and adding the visibility bridge command)*
64. `PKG_CONFIG_PATH=/home/linuxbrew/.linuxbrew/lib/pkgconfig:/home/linuxbrew/.linuxbrew/Cellar/vte3/0.82.3_4/lib/pkgconfig:/usr/lib/x86_64-linux-gnu/pkgconfig:/usr/share/pkgconfig:$PKG_CONFIG_PATH LIBRARY_PATH=/home/linuxbrew/.linuxbrew/lib LD_LIBRARY_PATH=/home/linuxbrew/.linuxbrew/lib:/home/linuxbrew/.linuxbrew/Cellar/vte3/0.82.3_4/lib cargo test native_vte_ -- --nocapture` *(green: `18/18` native regression after adding `native_vte_set_visibility`)*
65. `npm test -- --runTestsByPath src/components/__tests__/TerminalTTY.test.js --runInBand` *(red: new split-panel geometry test proved native GTK/VTE did not resize when only the panel/container changed size)*
66. `npm test -- --runTestsByPath src/components/__tests__/TerminalTTY.test.js src/lib/terminal/__tests__/nativeVteBridge.test.js --runInBand` *(green: `56/56` after adding an active native `ResizeObserver` on the terminal placeholder/container)*
67. `npm test -- --runTestsByPath src/components/__tests__/terminalRendererPreferences.test.js src/components/__tests__/terminalRendererCapabilities.test.js src/components/__tests__/TerminalWorkspacesManager.panel-subtabs.test.jsx src/components/__tests__/TerminalTTY.test.js src/components/__tests__/terminalWorkspaceStateHelpers.test.js src/lib/terminal/__tests__/nativeVteBridge.test.js --runInBand` *(green: `102/102` after GTK-default preferences, renderer switch label/order cleanup, native unmount-hide/session-close split, and view-switch reuse tests)*
68. `PKG_CONFIG_PATH=/home/linuxbrew/.linuxbrew/lib/pkgconfig:/home/linuxbrew/.linuxbrew/Cellar/vte3/0.82.3_4/lib/pkgconfig:/usr/lib/x86_64-linux-gnu/pkgconfig:/usr/share/pkgconfig:$PKG_CONFIG_PATH LIBRARY_PATH=/home/linuxbrew/.linuxbrew/lib LD_LIBRARY_PATH=/home/linuxbrew/.linuxbrew/lib:/home/linuxbrew/.linuxbrew/Cellar/vte3/0.82.3_4/lib cargo test native_vte_ -- --nocapture` *(red once on unavailable `set_color_cursor_foreground`, then green: `19/19` after using supported VTE color APIs and adding same-panel reuse coverage)*

## Result Notes

- Preserved native leases now recover honestly when another active panel steals the registry: making the hidden lease visible can fail with `panel-not-active`, so `TerminalTTY` now reopens the native panel in place instead of staying stuck on a stale lease.
- The stolen-lease regression test had to reject only the first `visible: true` restore attempt; otherwise the inactive hide/unmount visibility calls could consume the one-shot rejection and hide the real bug.
- The three suites named in the verify report are now green.
- TERM-03 now has direct proof for focus, resize, explicit same-window/no-external-window behavior, and explicit no-Ghostty behavior.
- The fallback path now actively re-focuses the live xterm surface on viewport mouse-down when GTK VTE is requested but unavailable, restoring usability without changing native-active behavior.
- Renderer selection now makes the two scopes visible in the toolbar, keeps the panel selector bound to raw override state, and exposes `inherit` so panels can explicitly follow workspace default without ambiguity.
- Tauri bootstrap no longer treats an open TCP socket on port 3100 as sufficient readiness; it now waits until `GET /` returns an HTTP success/redirect so the webview does not lock onto the transient Next 404 page.
- The old “missing GTK/WebKit libs” blocker was FALSE once cargo preserved the correct pkg-config path; Rust readiness tests now execute locally and pass.
- `native_vte_probe` now performs a real Linux same-window access check against Tauri GTK handles and the attached WebKit webview instead of returning unconditional success on Linux.
- The next real blocker is stronger and code-backed: attempting to keep live GTK/VTE widgets in Tauri-managed state fails because `State<T>` requires `Send + Sync`, while GTK/VTE objects are main-thread-only and non-`Send`.
- `native_vte_open` no longer pretends success from scaffold state; it now returns explicit runtime blocker evidence (`native-gtk-vte-runtime-blocked-by-tauri-state-model`) after verifying same-window GTK/Tauri access and constructing the native shell launch payload.
- TERM-03 now owns live GTK/VTE objects inside a Linux-only main-thread registry and keeps `State<T>` metadata-only, removing the original `Send + Sync` blocker honestly rather than masking it.
- Native attach now reuses the existing Tauri main window by wrapping the webview in a GTK overlay/layout host and spawning a real VTE shell inside the active panel bounds.
- The verified manual-QA blocker was not the Phase 5 registry attach itself but the pre-open probe gate: `probe-failed` happened because readiness incorrectly depended on `webview.inner().parent().is_some()` before attach had a chance to run.
- Probe/open now share a less brittle host-readiness contract: if Tauri can expose the main window, its default vbox, and a visible webview, the native path is allowed to proceed into the real attach logic.
- React now treats early `probe-failed` as a bounded retry state instead of a sticky fallback: delayed retries can be replaced by immediate focus/visibility retries, while successful native open or stronger `open-failed` outcomes cancel further probing.
- The newest manual blocker evidence pointed at one more startup-timing race in Rust: `with_webview(...)` could succeed while `webview.inner().is_visible()` was still false, so probe stopped early even though the same-window host handle already existed.
- Probe/open now classify webview accessibility by handle availability rather than early visibility flips, which should honestly move runtime from `probe-failed` toward either real attach success or the next stronger `open-failed` blocker.
- Probe no longer collapses all early host failures into opaque `probe-failed`; the next manual rerun can now distinguish missing main window, missing default vbox, missing webview handle, or missing host primitives explicitly.
- The new layered strategy is now embodied in code: `npm run native:vte-smoke` gives us a standalone GTK/VTE harness outside DevHub/Tauri integration so we can prove the GTK/VTE stack itself before touching more in-app attach behavior.
- Harness interpretation is explicit: if the standalone window opens and the shell works, the next slice should focus ONLY on same-window Tauri attach; if it fails, stop deepening app integration and fix/reject the GTK/VTE stack first.
- The newest native blocker was neither GTK window creation nor prompt rendering logic — it was a binding edge case in `zoha-vte 0.6.0`: `spawn_sync(None, ...)` still forwarded non-null `child_setup_data`, tripping VTE's assertion and crashing before the shell prompt.
- Both native paths now pass a no-op `child_setup` callback instead of `None`, which is the smallest honest fix because it preserves real native spawn while removing the invalid binding combination that caused the panic.
- Standalone harness PASS now gives us a hard boundary: GTK/VTE + shell spawn are proven, so the remaining TERM-03 work is squarely about preparing and reusing the real GTK host inside the Tauri window hierarchy.
- Probe/open no longer just inspect same-window host readiness — they now actively prepare/ensure the GTK overlay host during the in-app path, which is the narrowest honest next move toward real same-window rendering progress.
- The latest `probe-failed` evidence showed that even this was too coupled: probe was mutating the host hierarchy before open, so the contract still mixed lightweight capability checking with real attach preparation.
- Probe and open are now separated honestly: probe only inspects existing same-window primitives, while open alone performs the mutating host preparation. If the next manual state becomes `open-failed`, that is real progress because probe no longer consumes the attach attempt prematurely.
- Manual QA can now reach the real TERM-03 in-app runtime again: the Tauri wrapper skips `beforeDevCommand` when `devUrl` already answers, and Rust cleanup/adoption now recognizes sidecar listeners reported as `MainThread`, removing false `EADDRINUSE` blockers on both `3100` and `4000`.
- Probe/open readiness now use the direct Tauri Linux webview handle as an explicit signal, not just `default_vbox.children()` shape, so a live same-window webview can count as accessible even when vbox child ordering is not yet the decisive indicator.
- First-time overlay creation no longer depends solely on `default_vbox.children().last()`: when available, the real direct webview widget handle is removed from its current parent and reused as the overlay child, which is the honest next step toward moving runtime from `probe-failed` to either real attach or the next stronger `open-failed` blocker.
- Workspace/window switches no longer intentionally close the opened GTK/VTE lease: React now preserves the native lease while inactive and uses a Rust `native_vte_set_visibility` command to hide/show the GTK layout, keeping the shell process alive without letting the native overlay bleed into hidden workspaces.
- Native GTK/VTE resize is no longer tied only to browser `window.resize`: active native panels now observe their placeholder/container geometry, so split-handle and panel-width changes send updated bounds to Rust without requiring a full window resize.
- GTK VTE is now the default requested renderer for fresh workspaces/views; xterm remains available as an explicit recovery override and capability fallback.
- V1/V2 view switching no longer treats React unmount as native-session close: unmount hides the GTK layout, explicit session removal dispatches `devhub:terminal-session-closing`, and Rust reuses the live same-panel terminal instead of spawning a fresh shell when the view returns.
- Native VTE now applies a DevHub-aligned foreground/background/cursor/selection palette and queues GTK relayout after terminal bounds updates.
- The strongest remaining blocker is narrower and runtime-specific: we still need Linux/Tauri manual QA proof that the attached VTE stays visually aligned and leak-free across real panel switching, close, and window reload/recreate — automated tests cannot prove that UX.
- Project-local Tauri env stabilization works for the supported wrapper workflow (`scripts/tauri-cli.cjs`), but bare `cargo test` still fails when the shell does not already export `PKG_CONFIG_PATH`; that is expected because the design deliberately scoped stabilization to Tauri tooling, not arbitrary raw cargo invocations.
- Full `npm test` still reports unrelated pre-existing API harness failures under `tests/agenthub/api/*` that were not part of the TERM-03 verify report and would broaden scope beyond this verify-gap closure.

## Deviations from Design

- TERM-03 now uses `zoha-vte` to stay on the GTK 3 stack Tauri already exposes on Linux. This is a narrow spike-only dependency choice, not a TERM-04 rollout commitment.

## Incremental Apply Slice — Active-panel lease recovery

- [x] Fixed the native preserved-lease recovery path so a `panel-not-active` visibility failure reopens the GTK/VTE panel instead of leaving the panel stuck on a stale hidden lease.
- [x] Strengthened the focused `TerminalTTY` regression so only the first active `visible: true` restore attempt rejects, proving the reopen path instead of accidentally consuming the error on inactive hide calls.

## Remaining Work

- [ ] If the broader repo still requires global green `npm test`, fix unrelated `tests/agenthub/api/*` server/fetch failures in a separate change.
- [ ] Run honest standalone GTK/VTE smoke QA via `npm run native:vte-smoke` and capture pass/fail notes for window open, prompt, typing, resize, and clean close.
- [ ] If the standalone harness passes, use that evidence to choose the smallest next same-window Tauri attach slice; if it fails, stop and fix/reject GTK/VTE stack issues before going deeper in-app.
- [ ] Run honest Linux/Tauri manual QA (`npm run tauri:dev`) and capture screenshots/logs proving in-window attach, focus/input, resize, panel switch, close, and forced-failure fallback continuity.
- [ ] Verify registry cleanup across main-window reload/recreate so the overlay/layout host cannot leak stale GTK widgets.

## Incremental Files Touched

| File | Action | What changed |
|---|---|---|
| `src/components/TerminalTTY.jsx` | Modified | Reopen the native GTK/VTE lease after a preserved-panel `panel-not-active` visibility failure instead of staying on a stale lease. |
| `src/components/__tests__/TerminalTTY.test.js` | Modified | Tightened the stolen-lease regression so only the first active visibility restore rejects and the reopen path is asserted deterministically. |

## Incremental TDD Cycle Evidence

| Task | Test File | Layer | Safety Net | RED | GREEN | TRIANGULATE | REFACTOR |
|---|---|---|---|---|---|---|---|
| P6-15a Recover preserved native lease after active-panel steal | `src/components/__tests__/TerminalTTY.test.js` | Integration | ✅ Focused suite first failed `52/53` on the stolen-lease regression | ✅ Tightened the failing-first stolen-lease test so the first active `visible: true` restore rejects with `panel-not-active` | ✅ `npm test -- --runTestsByPath "src/components/__tests__/TerminalTTY.test.js" --runInBand` passed `53/53`; focused TERM-03 trio passed `71/71` | ✅ Covers inactive hide, first active visibility rejection, and in-place reopen on preserved lease recovery | ✅ Extracted native open result handling so initial open and reopen share the same minimal state transition path |

## Incremental Tests Run

69. `npm test -- --runTestsByPath "src/components/__tests__/TerminalTTY.test.js" --runInBand` *(red: `52/53`; stolen-lease recovery stayed on the stale preserved lease and never reopened native)*
70. `npm test -- --runTestsByPath "src/components/__tests__/TerminalTTY.test.js" --runInBand -t "reopens a preserved native lease if another active panel stole the registry while inactive"` *(red then green during TDD loop while tightening the visibility mock to reject only the first active restore attempt)*
71. `npm test -- --runTestsByPath "src/components/__tests__/TerminalTTY.test.js" "src/lib/terminal/__tests__/nativeVteBridge.test.js" "src/components/__tests__/TerminalWorkspacesManager.reopen.test.jsx" --runInBand` *(green: `71/71` after the preserved-lease reopen fix)*
