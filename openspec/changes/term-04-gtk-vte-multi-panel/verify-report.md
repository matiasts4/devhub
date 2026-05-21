# Verification Report

**Change**: term-04-gtk-vte-multi-panel  
**Version**: N/A  
**Mode**: Strict TDD

---

### Completeness

| Metric | Value |
|--------|-------|
| Tasks total | 17 |
| Tasks complete | 5 |
| Tasks incomplete | 12 |

Incomplete: 2.1, 2.2, 2.3, 3.1-3.5, 4.1-4.4

---

### Build & Tests Execution

**Build**: ➖ Not run (developer policy: never build after changes)

**Tests**: ✅ Focused Jest 112 passed / ✅ Rust native_vte 27 passed / ⚠️ 0 skipped

Latest focused commands:
- `npm test -- --runTestsByPath src/components/__tests__/terminalRendererCapabilities.test.js src/lib/terminal/__tests__/nativeVteBridge.test.js src/components/__tests__/TerminalTTY.test.js src/components/__tests__/TerminalWorkspacesManager.split-layout.test.jsx src/components/__tests__/TerminalWorkspacesManager.panel-subtabs.test.jsx` → PASS 112/112
- `PKG_CONFIG_PATH=/home/linuxbrew/.linuxbrew/lib/pkgconfig:/home/linuxbrew/.linuxbrew/Cellar/vte3/0.82.3_4/lib/pkgconfig:/usr/lib/x86_64-linux-gnu/pkgconfig LIBRARY_PATH=/home/linuxbrew/.linuxbrew/lib LD_LIBRARY_PATH=/home/linuxbrew/.linuxbrew/lib:/home/linuxbrew/.linuxbrew/Cellar/vte3/0.82.3_4/lib cargo test native_vte --lib` → PASS 27/27

Notes:
- Plain `cargo test native_vte --lib` failed in this environment because `vte-2.91.pc` was not on `PKG_CONFIG_PATH`; rerun with the Homebrew/Linux pkg-config path above.
- Rust test stderr still prints `Failed to create stream fd: Operation not permitted` before running tests in this sandbox, but the targeted `native_vte` suite exits green.
- Jest still reports open-handle cleanup warning after focused runs.

**Coverage**: ➖ Not available

---

### TDD Compliance

| Check | Result | Details |
|-------|--------|---------|
| TDD Evidence reported | ❌ | `apply-progress` artifact not present |
| All tasks have tests | ⚠️ | 5/17 task rows have direct test evidence read here |
| RED confirmed (tests exist) | ✅ | `native_vte.rs`, bridge, `TerminalTTY`, and split-layout tests exist |
| GREEN confirmed (tests pass) | ✅ | Focused JS and Rust unit suites pass |
| Triangulation adequate | ⚠️ | JS/bridge and Rust helper coverage are green; native desktop smoke still needed |
| Safety Net for modified files | ⚠️ | Modified-file safety net is incomplete because Rust migration is unfinished |

**TDD Compliance**: 3/6 checks passed

---

### Test Layer Distribution

| Layer | Tests | Files | Tools |
|-------|-------|-------|-------|
| Unit | 41 | 2 | Jest + Rust cargo test |
| Integration | 98 | 4 | Jest / Testing Library-style DOM harness |
| E2E | 0 | 0 | not installed / not run |
| **Total** | **139** | **6** | |

---

### Spec Compliance Matrix

| Requirement | Scenario | Test | Result |
|-------------|----------|------|--------|
| Visible split panels keep independent native surfaces | Two visible split panels attach concurrently | `TerminalTTY.test.js > opens native GTK VTE for each visible split panel instead of only the focused one` | ⚠️ PARTIAL |
| Visible split panels keep independent native surfaces | Hidden layout detaches without closing | `TerminalTTY.test.js > hides the native lease only when the panel leaves the visible layout and restores it on return` | ⚠️ PARTIAL |
| Focus, input, resize, and close are panel-scoped | Focus and input move without collapsing siblings | `TerminalWorkspacesManager.split-layout.test.jsx > keeps two visible split native panels mounted at the same time while focus stays panel-scoped` | ⚠️ PARTIAL |
| Focus, input, resize, and close are panel-scoped | Explicit close removes one panel only | `TerminalWorkspacesManager.split-layout.test.jsx > wires reset and per-panel close intent while keeping the visible sibling mounted` | ⚠️ PARTIAL |
| Renderer resolution is independent per panel | Selection on one panel does not evict another | `terminalRendererCapabilities.test.js` + `TerminalTTY.test.js` split-panel cases | ⚠️ PARTIAL |
| Unsupported hosts stay on xterm without breaking layout | Non-Linux or non-Tauri panel falls back deterministically | `terminalRendererCapabilities.test.js > marks GTK VTE ready only after Linux + Tauri + successful runtime probe` | ⚠️ PARTIAL |

**Compliance summary**: 0/6 scenarios fully compliant

---

### Correctness (Static — Structural Evidence)

| Requirement | Status | Notes |
|------------|--------|-------|
| Multi-panel registry | ⚠️ Partial | `src-tauri/src/native_vte.rs` now separates `focused_panel_id` from `visible_panel_ids`; GTK registry no longer show-only/hide-all in open/visibility/focus paths, but native smoke proof is still pending |
| Panel-scoped visibility/resize/focus/close | ⚠️ Partial | JS bridge and React are panel-scoped; Rust unit coverage passes for metadata/geometry/overlay pass-through, Rust uses a `gtk::Fixed` overlay host, React no longer hides a native panel during its own opening phase transitions, re-shown panels send delayed resize passes after split layout settles, and V1/V2 window snapshots are now synchronized before switching/closing; real GTK/VTE desktop behavior still needs smoke verification |
| Per-panel fallback isolation | ✅ Implemented | JS fallback is local and panel-scoped in `TerminalTTY.jsx` and bridge tests |
| Unsupported-host fallback | ✅ Implemented | Runtime capability selection resolves to xterm on non-Linux / missing Tauri |

---

### Coherence (Design)

| Decision | Followed? | Notes |
|----------|-----------|-------|
| Shared GTK overlay host | ✅ Yes | Same-window host path is preserved |
| Multi-panel registry keyed by `panelId` | ⚠️ Partial | Rust registry has panel map + focused owner; helper state now records visible panels; smoke verification still pending |
| React lifecycle: hide vs close | ✅ Mostly | JS distinguishes hide/unmount from explicit close |
| Panel-local fallback | ✅ Yes | Fallback is kept local to each panel |
| Explicit native focus owner | ⚠️ Partial | JS intent is panel-scoped; Rust now stores focus separately from visibility, but native focus behavior still needs desktop smoke verification |

---

### Issues Found

**CRITICAL**
- Strict TDD evidence artifact is missing (`apply-progress` not found).
- Rust TERM-04 registry migration is still incomplete until a real Linux/Tauri smoke proves two GTK/VTE widgets visible together.
- Native overlay click interception was addressed again after manual report: the host now replaces stale full-window `gtk::Layout` children with a pass-through `gtk::Fixed` overlay container and re-focuses native VTE from React shell clicks; manual desktop verification is still required.

**WARNING**
- `Jest did not exit one second after the test run has completed` indicates open handles.
- React console warnings: outdated JSX transform and unknown `minSize` prop on DOM element.
- No E2E/native smoke proof was run; only Rust unit tests and focused Jest were run.

**SUGGESTION**
- Add a verified Rust native smoke path once GTK/WebKit deps exist.
- Tighten split-layout test cleanup to eliminate open handles.

---

### Verdict

FAIL

JS/bridge work is mostly in place, the previously failing focused fallback test is green, and Rust unit coverage now exercises focus/visible-panel separation. TERM-04 is still not complete until a real Linux/Tauri smoke proves simultaneous visible GTK/VTE panels in the same window.
