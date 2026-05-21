# Implementation Progress

**Change**: term-04-gtk-vte-multi-panel
**Mode**: Strict TDD

### Completed Tasks
- [x] RED: added Rust geometry tests proving native separator gutter sizing stays inside panel bounds and remains clamped for tiny split panes.
- [x] GREEN: wrapped each native VTE in a GTK `Frame` host with native border/shadow gutter so split separation is painted by GTK, not only by the webview layer.
- [x] REFACTOR: centralized native layout visibility sync so show/hide/close flows keep the overlay visible only while any native panel remains shown.
- [x] RED: added bridge and workspace tests proving native `panel-activated` events must move the global split target to the actual GTK/VTE panel the user focused.
- [x] GREEN: emitted native `panel-activated` runtime events from GTK/VTE focus/button paths and consumed them in React so `activePanelIds`/window snapshots follow native focus.
- [x] REFACTOR: removed double gutter subtraction from native VTE geometry so GTK frame separation stays continuous without truncating the live terminal area.
- [x] RED: added panel chrome/body tests proving per-panel controls must render outside the native terminal body and native bounds must attach to the content region only.
- [x] GREEN: moved split/close actions into a dedicated panel header, bound native geometry to the terminal content body, and inset Rust-side GTK/VTE geometry away from split gutters.
- [x] REFACTOR: reused workspace activation wiring for panel header clicks and flattened GTK host styling so React dividers own the visual separator again.
- [x] RED: added manager and `TerminalTTY` tests proving Grid dropdown overlays and internal split drags must suspend visible native GTK/VTE surfaces instead of relying on DOM overlay stacking.
- [x] GREEN: centralized overlay/drag suspension policy in `TerminalWorkspacesManager` and passed it to each visible `TerminalTTY` so native panels hide during Grid open or split drag, then restore with visibility/resize/focus.
- [x] REFACTOR: extracted a shared native show path in `TerminalTTY` and reused one suspension flag for dropdown + drag flows instead of scattering per-overlay patches.
- [x] RED: extended suspension coverage to require resume-time `set_visibility(true)` payloads include fresh bounds for each visible sibling, plus Rust geometry evidence for offscreen invalidation during hide.
- [x] GREEN: `TerminalTTY` now forwards fresh bounds on resume-show and Rust `native_vte_set_visibility` accepts optional bounds/reason, invalidating hidden GTK hosts to an offscreen 1x1 rect before hiding.
- [x] REFACTOR: reused the same measured content-body bounds for resume-show and follow-up resize so bridge/native policy stays centralized instead of split across ad-hoc drag handlers.
- [x] RED: tightened split-layout coverage so floating panel chrome must live inside an explicit safe-zone strip with a stable min-top contract, not just a padding class.
- [x] GREEN: moved the floating overlay into a dedicated safe-zone strip above the terminal body, using a 40px minimum inset that fully contains the chip outside the native GTK/VTE surface.
- [x] REFACTOR: localized the safe-zone height in one panel-level constant and exposed semantic test ids/attributes so future chrome tweaks do not depend on fragile class assertions.
- [x] RED: added split-layout expectations proving the safe zone must render a semantic one-line header sourced from command metadata or `devhub_agent_runs` precedence.
- [x] GREEN: derived minimalist panel header metadata from `devhub_agent_runs` first and `initialCommand` second, keeping the label inside the safe zone while preserving native/body separation and compact right-side actions.
- [x] REFACTOR: extracted panel metadata helpers for agent normalization, quiet truncation, and panel-id indexing so semantic header rendering stays deterministic and low-noise.
- [x] RED: tightened the split-layout safe-zone contract again so the compact header refinement must expose the smaller min-top value without dropping semantic metadata or overlay controls.
- [x] GREEN: reduced the floating safe-zone/header chrome from 40px to 36px and trimmed the semantic/header paddings for a slightly shorter minimal header.
- [x] REFACTOR: kept the adjustment localized to safe-zone spacing tokens so metadata, controls, and native/body separation contracts remain unchanged.
- [x] RED: updated the split-layout safe-zone contract to require a 34px min-top while preserving semantic metadata and floating controls.
- [x] GREEN: reduced the panel safe-zone minimum inset from 36px to 34px for a slightly thinner top chrome without changing the header structure.
- [x] REFACTOR: kept the micro-adjustment isolated to the existing safe-zone constant so the body separation and control wiring stay untouched.
- [x] RED: added right-dock manager and `TerminalTTY` tests proving browser/editor side-by-side dock mode must suspend native GTK/VTE with a distinct fallback policy, boot visible xterm, and restore native on close.
- [x] GREEN: extended the centralized renderer policy so right-dock browser/editor side-by-side mode propagates `dock-side-by-side`, hides native surfaces, boots xterm fallback in-place, and restores GTK/VTE visibility/resize/focus when the dock clears.
- [x] REFACTOR: derived `shouldUseNativeRenderer` from the resolved runtime phase and reused one policy enum in manager/TTY instead of layering another ad-hoc right-dock boolean.

### Files Changed
| File | Action | What Was Done |
|------|--------|---------------|
| `src-tauri/src/native_vte.rs` | Modified | Added GTK frame-backed native panel hosts, then flattened host styling and applied real gutter insets so native content no longer owns divider visuals. |
| `src/components/TerminalWorkspacesManager.jsx` | Modified | Synced workspace active-panel state from native activation and introduced dedicated per-panel header/body chrome so controls stay outside native bounds. |
| `src/components/TerminalTTY.jsx` | Modified | Consumed native panel activation events and attached native placeholder/bounds to a dedicated content body instead of the full panel shell. |
| `src/components/__tests__/TerminalWorkspacesManager.split-layout.test.jsx` | Modified | Added coverage for native activation changing split source plus header/body chrome separation. |
| `src/components/__tests__/TerminalTTY.test.js` | Modified | Added coverage proving native bounds originate from the content body and do not rely on full-panel shell geometry. |
| `src/lib/terminal/__tests__/nativeVteBridge.test.js` | Modified | Added coverage for `panel-activated` event relay on the browser bridge. |
| `openspec/changes/term-04-gtk-vte-multi-panel/tasks.md` | Modified | Recorded partial progress for the GTK-native separator/chrome bugfix under tasks 2.2, 3.3, and 3.4. |
| `openspec/changes/term-04-gtk-vte-multi-panel/apply-progress.md` | Modified | Persisted cumulative strict-TDD apply evidence for separator, native activation, and chrome-vs-bounds batches. |
| `src/components/TerminalWorkspacesManager.jsx` | Modified | Centralized native-surface suspension state for Grid overlay open state and internal split dragging, then propagated one policy flag to visible terminal panels. |
| `src/components/TerminalTTY.jsx` | Modified | Added `suspendNativeSurface` handling so native panels hide with `set_visibility(false)` during overlays/drags and resume with show/resize/focus without closing the lease. |
| `src/components/__tests__/TerminalWorkspacesManager.split-layout.test.jsx` | Modified | Added behavioral coverage for Grid dropdown suspension and internal split-drag suspension while preserving active split target behavior. |
| `src/components/__tests__/TerminalTTY.test.js` | Modified | Added suspension/resume coverage that verifies native hide/show plus restore resize/focus calls. |
| `src/lib/terminal/__tests__/nativeVteBridge.test.js` | Modified | Extended visibility payload contract coverage so resume/show carries bounds and suspend reasons through the Rust request wrapper. |
| `src-tauri/src/native_vte.rs` | Modified | Added hide-time offscreen bounds invalidation and visibility payload support for fresh resume bounds, preventing stale GTK geometry from surviving drag suspension. |
| `src/components/TerminalWorkspacesManager.jsx` | Modified | Introduced an explicit floating safe-zone strip with subtle blend styling so the action chip remains fully above the native body without becoming a visible header bar. |
| `src/components/__tests__/TerminalWorkspacesManager.split-layout.test.jsx` | Modified | Locked the safe-zone contract with stable data attributes and verified overlay containment stays outside `panel-body`. |
| `openspec/changes/term-04-gtk-vte-multi-panel/tasks.md` | Modified | Added follow-up note documenting the explicit panel safe-zone contract for floating chrome. |
| `src/components/TerminalWorkspacesManager.jsx` | Modified | Added low-weight semantic header derivation/rendering in the safe zone, prioritizing `devhub_agent_runs` metadata over `initialCommand` fallbacks. |
| `src/components/__tests__/TerminalWorkspacesManager.split-layout.test.jsx` | Modified | Added coverage for semantic header derivation from command metadata, precedence from `devhub_agent_runs`, and continued safe-zone/body separation. |
| `openspec/changes/term-04-gtk-vte-multi-panel/tasks.md` | Modified | Recorded semantic safe-zone header follow-up work under the React split-layout task stream. |
| `src/components/TerminalWorkspacesManager.jsx` | Modified | Tightened the safe-zone min-top and header/control paddings so the semantic header occupies slightly less vertical space without touching native-body/control contracts. |
| `src/components/__tests__/TerminalWorkspacesManager.split-layout.test.jsx` | Modified | Updated the behavioral safe-zone assertion to the refined 36px contract while keeping metadata/control coverage intact. |
| `openspec/changes/term-04-gtk-vte-multi-panel/tasks.md` | Modified | Documented the compact header refinement under the safe-zone follow-up stream. |
| `src/components/TerminalWorkspacesManager.jsx` | Modified | Reduced the panel safe-zone min-top from 36px to 34px as a conservative follow-up that keeps the same semantic/native-safe chrome structure. |
| `src/components/__tests__/TerminalWorkspacesManager.split-layout.test.jsx` | Modified | Updated the behavioral safe-zone contract assertion from 36px to 34px while preserving metadata/control/body-separation coverage. |
| `openspec/changes/term-04-gtk-vte-multi-panel/tasks.md` | Modified | Recorded the 34px safe-zone micro-thinning follow-up under task 3.4.a. |
| `src/components/TerminalWorkspacesManager.jsx` | Modified | Extended the centralized native-surface policy to treat right-dock browser/editor side-by-side mode as a distinct `dock-side-by-side` fallback policy while preserving Grid/drag suspension flows. |
| `src/components/TerminalTTY.jsx` | Modified | Resolved dock side-by-side runtime to `fallback-xterm`, hid native with reason `dock-side-by-side`, and restored GTK/VTE on resume using the existing show/resize/focus path. |
| `src/components/__tests__/TerminalWorkspacesManager.right-dock.test.jsx` | Modified | Added behavioral coverage proving right-dock browser/editor side-by-side mode propagates the dock fallback policy and clears it on close. |
| `src/components/__tests__/TerminalTTY.test.js` | Modified | Added runtime-phase and component tests covering dock fallback-xterm boot, native hide reason, and native restoration after dock close. |
| `openspec/changes/term-04-gtk-vte-multi-panel/tasks.md` | Modified | Recorded the right-dock renderer policy follow-up under tasks 3.3/3.4. |

### TDD Cycle Evidence
| Task | Test File | Layer | Safety Net | RED | GREEN | TRIANGULATE | REFACTOR |
|------|-----------|-------|------------|-----|-------|-------------|----------|
| 2.2 separator bugfix | `src-tauri/src/native_vte.rs` | Unit (Rust) | ⚠️ `cargo test native_vte --lib -- --nocapture` blocked by missing system GTK/WebKit pkg-config libs (`javascriptcoregtk-4.1`, `libsoup-3.0`, `webkit2gtk-4.1`) before exercising the file | ✅ Added `native_vte_panel_geometry_*` tests first | ⚠️ Execution blocked by same environment dependency gap after implementation | ✅ normal panel + tiny-panel clamp cases | ✅ Extracted `derive_native_vte_panel_geometry()` and `sync_registry_layout_visibility()` to keep wrapper logic minimal |
| 2.2/3.4 native activation bridge | `src/lib/terminal/__tests__/nativeVteBridge.test.js`, `src/components/__tests__/TerminalWorkspacesManager.split-layout.test.jsx`, `src/components/__tests__/TerminalTTY.test.js` | Integration | ✅ `npm test -- src/lib/terminal/__tests__/nativeVteBridge.test.js`; ✅ `npm test -- src/components/__tests__/TerminalWorkspacesManager.split-layout.test.jsx`; ✅ `npm test -- src/components/__tests__/TerminalTTY.test.js` | ✅ Added failing expectations for `panel-activated` relay + split targeting first | ✅ Targeted Jest suites passed after wiring runtime events into React state | ✅ covered explicit native event path plus direct click path regression | ✅ Reused one activation pathway across manager + TTY instead of duplicating split-specific state logic |
| 2.2/3.3/3.4 chrome-vs-native bounds fix | `src/components/__tests__/TerminalTTY.test.js`, `src/components/__tests__/TerminalWorkspacesManager.split-layout.test.jsx`, `src-tauri/src/native_vte.rs` | Integration + Unit (Rust) | ✅ `npm test -- src/components/__tests__/TerminalTTY.test.js`; ✅ `npm test -- src/components/__tests__/TerminalWorkspacesManager.split-layout.test.jsx`; ⚠️ `cargo test native_vte --lib -- --nocapture` blocked by missing GTK/WebKit pkg-config libs | ✅ Added failing header/body and content-body bounds tests first | ✅ Targeted Jest suites passed after moving controls out of the terminal body and binding bounds to the content region; Rust execution still infra-blocked | ✅ covered panel header separation + dedicated content bounds + gutter inset cases | ✅ Reused `activateWorkspacePanel()` for header/native activation and flattened GTK styling so React chrome remains source of truth |
| 3.3/3.4 native suspension policy | `src/components/__tests__/TerminalTTY.test.js`, `src/components/__tests__/TerminalWorkspacesManager.split-layout.test.jsx` | Integration | ✅ `npm test -- src/components/__tests__/TerminalTTY.test.js`; ✅ `npm test -- src/components/__tests__/TerminalWorkspacesManager.split-layout.test.jsx` | ✅ Added failing tests first for Grid dropdown suspension, split-drag suspension, and native resume behavior | ✅ Targeted Jest suites passed after wiring centralized suspension state into manager + TTY | ✅ covered overlay-open + drag-start/drag-end + restore visibility/resize/focus paths | ✅ Centralized suspension policy in manager and extracted shared native show path in `TerminalTTY` |
| 2.2/3.3 ghost-resize fix | `src/components/__tests__/TerminalTTY.test.js`, `src/lib/terminal/__tests__/nativeVteBridge.test.js`, `src-tauri/src/native_vte.rs` | Integration + Unit (Rust) | ✅ `npm test -- src/components/__tests__/TerminalTTY.test.js`; ✅ `npm test -- src/lib/terminal/__tests__/nativeVteBridge.test.js`; ⚠️ `cargo test native_vte_hidden_panel_bounds_reset_geometry_offscreen_during_suspend --lib -- --nocapture` blocked by missing GTK/WebKit pkg-config libs | ✅ Added failing resume-bounds expectation before implementation; Rust helper assertion added before helper existed | ✅ Targeted Jest suites passed after resume-show forwarded bounds and Rust visibility accepted bounds/offscreen invalidation; Rust execution still infra-blocked | ✅ covered active resume + sibling resume + bridge request payload + hidden-bounds helper | ✅ Reused one resume visibility path with measured bounds instead of separate drag-specific geometry hacks |
| 3.4 floating safe-zone contract fix | `src/components/__tests__/TerminalWorkspacesManager.split-layout.test.jsx` | Integration | ✅ `npm test -- src/components/__tests__/TerminalWorkspacesManager.split-layout.test.jsx` | ✅ Added failing assertions first for `panel-safe-zone-*`, explicit safe-zone min-top, and overlay/body separation | ✅ Targeted Jest suite passed after moving chrome into the dedicated safe-zone strip | ✅ covered no-fixed-header, explicit safe-zone contract, overlay containment, and panel button availability | ✅ Centralized safe-zone height in one constant and switched assertions to semantic data attributes |
| 3.4 semantic safe-zone header | `src/components/__tests__/TerminalWorkspacesManager.split-layout.test.jsx` | Integration | ✅ `npm test -- src/components/__tests__/TerminalWorkspacesManager.split-layout.test.jsx` | ✅ Added failing assertions first for command-derived semantic metadata, `devhub_agent_runs` precedence, and safe-zone containment | ✅ Targeted Jest suite passed after rendering the minimalist semantic label inside the safe zone | ✅ covered command fallback, agent-run precedence, and continued body/chrome separation | ✅ Extracted pure-ish metadata helpers for normalization/truncation/indexing instead of embedding branching inside JSX |
| 3.4 compact header refinement | `src/components/__tests__/TerminalWorkspacesManager.split-layout.test.jsx` | Integration | ✅ `npm test -- src/components/__tests__/TerminalWorkspacesManager.split-layout.test.jsx` | ✅ Updated the safe-zone contract assertion first from 40px to 36px | ✅ Targeted Jest suite passed after trimming safe-zone/header paddings and min height | ✅ preserved semantic metadata, overlay containment, and control operability while shrinking the chrome | ✅ Kept spacing tweaks localized to the safe-zone tokens instead of changing behavior/control structure |
| 3.4 safe-zone micro-thinning | `src/components/__tests__/TerminalWorkspacesManager.split-layout.test.jsx` | Integration | ✅ `npm test -- src/components/__tests__/TerminalWorkspacesManager.split-layout.test.jsx` | ✅ Updated the safe-zone contract assertion first from 36px to 34px | ✅ Targeted Jest suite passed after lowering the safe-zone constant only | ➖ Single contract change; existing metadata/control/body-separation assertions remained active in the same test | ✅ Reused the existing safe-zone constant instead of introducing new chrome variants or layout branches |
| 3.3/3.4 right dock renderer fallback policy | `src/components/__tests__/TerminalTTY.test.js`, `src/components/__tests__/TerminalWorkspacesManager.right-dock.test.jsx`, `src/components/__tests__/TerminalWorkspacesManager.split-layout.test.jsx` | Integration | ✅ `npm test -- src/components/__tests__/TerminalTTY.test.js`; ✅ `npm test -- src/components/__tests__/TerminalWorkspacesManager.right-dock.test.jsx`; ✅ `npm test -- src/components/__tests__/TerminalWorkspacesManager.split-layout.test.jsx` | ✅ Added failing runtime-phase and right-dock policy assertions before implementation | ✅ Targeted Jest suites passed after propagating `dock-side-by-side` policy through manager + TTY | ✅ covered browser side-by-side, editor side-by-side, dock close/native restore, and existing Grid/drag regression paths | ✅ Reused runtime-phase derived native/fallback selection instead of adding a second renderer toggle path |

### Test Summary
- **Total tests written**: 3 Rust unit tests, 2 bridge integration tests, 10 workspace split/right-dock integration tests, 9 TerminalTTY tests (7 integration + 2 pure helper assertions).
- **Total tests passing**: 116 Jest tests across the targeted JS suites in this cumulative batch summary (73 TerminalTTY + 13 split-layout + 30 right-dock); Rust execution still blocked before compile by missing system GTK/WebKit development libraries.
- **Layers used**: Unit (Rust), Integration (Jest).
- **Approval tests**: None.
- **Pure functions created**: 2 (`derive_native_vte_panel_geometry`, `sync_registry_layout_visibility`).

### Deviations from Design
- None in architecture. Implementation stayed inside the existing shared overlay + registry model, with the main UX change being React-side chrome separation instead of trying to stack DOM overlays above GTK.

### Issues Found
- Rust test execution is infrastructure-blocked in this environment because required Linux development packages for WebKit/GTK are missing from pkg-config resolution.
- Jest targeted suites still print pre-existing warnings about the legacy JSX transform and mocked `minSize` props in the test harness; assertions remain green.
- Native GTK surfaces still sit above generic webview overlays unless they explicitly opt into the centralized suspension policy. Grid is now covered, but additional overlay producers may still need to toggle the same manager-level flag.
- Right-dock side-by-side browser/editor is now covered by the centralized policy, but any future DOM/webview overlay outside Grid/drag/right-dock still has to declare the same policy or GTK/VTE can overpaint it.
- Rust verification for the hide-time invalidation helper still cannot run locally because the Tauri crate graph fails before test compilation without Linux GTK/WebKit development packages.
- The floating safe-zone now relies on an explicit 36px contract. If chip sizing changes again, the contract constant and test must move together or GTK/VTE overlap can regress.
- The floating safe-zone now relies on an explicit 34px contract. If chip sizing changes again, the contract constant and test must move together or GTK/VTE overlap can regress.
- Semantic header precedence currently depends on the newest `launchedAt` value per `panelId` in `devhub_agent_runs`; if another producer writes stale timestamps, the visible label can regress to older metadata.

### Remaining Tasks
- [ ] Re-run the targeted Rust tests once `javascriptcoregtk-4.1`, `libsoup-3.0`, and `webkit2gtk-4.1` dev packages are available.
- [ ] Verify the native gutter/flat host visually in Linux/Tauri smoke coverage.
- [ ] Verify native `panel-activated` runtime events in an actual GTK/Tauri session to confirm focus-in and button-press both fire on the real VTE surface.
- [ ] Extend the same centralized suspension flag to any remaining webview overlays/popovers beyond Grid if Linux/Tauri QA shows more native-over-webview collisions.
- [ ] Verify Linux/Tauri right-dock browser/editor side-by-side visually so the new fallback path does not regress focus, resize, or perceived flicker during dock open/close.
- [ ] Validate in Linux/Tauri runtime that offscreen invalidation fully removes stale GTK paint during aggressive adjacent-panel compression, especially with right-dock interactions.
- [ ] Validate in Linux/Tauri runtime that the 34px floating safe-zone remains sufficient under compositor/font-scale variance and increase it only if the chip height changes.
- [ ] Validate with real swarm/task launches that `devhub_agent_runs` timestamps stay monotonic enough for semantic header precedence across reopens and recycled panels.

### Status
Panel chrome/bounds fix plus centralized native suspension policy now also covers right-dock browser/editor side-by-side mode via panel-local xterm fallback, while keeping the explicit floating safe-zone contract and minimalist semantic header. Verification remains partially blocked by local GTK/WebKit toolchain dependencies and pending Linux runtime QA for right-dock/native interaction plus aggressive adjacent-panel compression/non-Grid overlays.
