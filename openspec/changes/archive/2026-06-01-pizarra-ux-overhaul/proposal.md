# Proposal: Pizarra UX Overhaul (Phase 1)

## Archive

> Archived on **2026-06-01** (UTC) from branch `feature/session-workspace-restore`.
> **Status**: PASS_WITH_WARNINGS — 0 CRITICAL / 2 WARNING / 3 SUGGESTION (verify).
> **Commit range**: `48e9b4f` (task 1.1) → `8b7c662` (task 4.1), plus 6 interleaved agent-comms-redesign commits and 1 tty stabilization commit (out of scope, intentionally untouched by verify).
> **Baseline**: `96122e8` (pre-pizarra-ux-overhaul checkpoint). **HEAD at archive**: `0883a84` (post-agent-comms T-004; contains 13 pizarra commits intermixed with 6 agent-comms + 1 tty).

### Spec deltas promoted / merged to base specs

All 6 spec files in this change were promoted to base specs at archive time (no base specs existed for any of these stems):

| Delta spec (in this change)               | Promoted to base spec                                               |
| ----------------------------------------- | ------------------------------------------------------------------- |
| `specs/board-canvas/spec.md`              | `openspec/specs/board-canvas/spec.md`                               |
| `specs/board-element-placement/spec.md`   | `openspec/specs/board-element-placement/spec.md`                    |
| `specs/board-terminal-drag/spec.md`       | `openspec/specs/board-terminal-drag/spec.md`                        |
| `specs/board-browser-load/spec.md`        | `openspec/specs/board-browser-load/spec.md`                         |
| `specs/board-browser-pane/spec.md`        | `openspec/specs/board-browser-pane/spec.md`                         |
| `specs/pizarra-state-persistence/spec.md` | `openspec/specs/pizarra-state-persistence/spec.md` (alignment note) |

**Merges**: 0. **Promotions**: 6.

### Verify outcome

**Status**: PASS_WITH_WARNINGS.
**Findings**: 0 CRITICAL, 2 WARNING, 3 SUGGESTION.
**Spec coverage**: 52/52 (100%) — all 6 stems, all 14 work-unit tasks have passing tests.
**Test delta**: +56 new pizarra tests across 5 new files + 3 extended files. 0 ESLint errors on the 8 pizarra source files. Working-tree WIP at verify end is purely agent-comms-redesign scope (out of scope for this archive).

### Archive links

- Archive report (Engram): topic_key `sdd/pizarra-ux-overhaul/archive-report` (saved on 2026-06-01).
- Verify report (Engram): observation id `6382`, topic_key `sdd/pizarra-ux-overhaul/verify-report`.
- Apply progress (Engram): observation id `6379`, topic_key `sdd/pizarra-ux-overhaul/apply-progress`.
- Explore report (Engram): observation id `6354`, topic_key `sdd/pizarra-unify-2026-05-31/explore`.

### Design-doc fixes applied at archive

- **W2 fix**: `design.md §3.5` originally named `WorkspaceRightDock.jsx` lines 33-37 as the right-dock tab-strip owner. The actual code lives in `src/components/TerminalWorkspacesManager.jsx` lines 3746-3806. The archive patch corrects this in the §3.5 "Current state" paragraph and in 4 other design.md references (test strategy reference in §3.4 and §3.5, persisted-state list in §9, file plan in §10, test-suite heading in §11). All replacements point to `src/components/__tests__/TerminalWorkspacesManager.right-dock.test.jsx` (the actual test file extended by task 3.7). An inline archive note documents the correction.

### Open WARNINGs and SUGGESTIONs (follow-up debt)

Carried forward as non-blocking follow-up:

- **W1** — `PizarraCanvas.grid.test.jsx` test "renders no Konva Line children when grid is disabled (default)" is flaky in combined Jest runs (passes 100% in isolation). Root cause: file-scope env-var mutation collides with sibling suites sharing `globalThis`. Move env mutation into `beforeEach`/`afterEach` or use `jest.isolateModules`.
- **W2** — fixed at archive time (see above).
- **S1** — commit `48e9b4f` (task 1.1) is missing the `Change-Id: pizarra-ux-overhaul` footer. Other 12/13 commits have it. Subject marker `[pizarra-ux-overhaul 1.1]` is present and sufficient for grep-based discovery.
- **S2** — `PizarraBrowserSurface.jsx:20,21,390` — 3 minor lint warnings (unused `Move` and `RefreshCw` lucide imports, unused `e` arg in mouseup handler, complex useEffect dep). All non-blocking.
- **S3** — `PizarraToolPalette.jsx:4,7,8,18` — pre-existing `React` / `ToggleGroup` / `Plus` unused imports, unchanged by this change. Carry-over from prior baseline.

### Deferred follow-up changes (deferred scope, not in this archive)

- `pizarra-browser-tabs` — multi-tab browser in the pizarra (deferred from Move 4; tab list inside a single browser pane is explicitly OUT OF SCOPE per `board-browser-pane` Non-Goals).
- `pizarra-workspace-bridge` — pizarra↔workspace identity unification (terminals and browsers created in one surface appearing as the SAME session in the other).
- Native VTE fixes unrelated to drag (font, overlay bounds, scale) — `term-04-gtk-vte-multi-panel` and other `native-terminal-vte-*` references.
- `transform: scale()` removal on the canvas wrapper (deferred from `board-canvas` Non-Goals).
- Default browser URL alignment between `shapeModel.js` and `PizarraBrowserSurface` (deferred from explore).
- Dead placeholder cleanup of `src/components/workspace/PizarraPane.jsx` and `usePizarraState.js` (per user instruction, untouched by this change).
- The in-flight `pizarra-state-persistence` change must adopt the array-shaped reducer and drop the stale `Map<id, PizarraElement>` description per the alignment note (TODO marker present in `openspec/changes/pizarra-state-persistence/design.md` line 16).

### Risk notes

- The verify ran with 6 interleaved `feat(agent-comms)` commits + 1 `feat(terminal)` commit + 1 `test(tty)` stabilization commit on the same branch. None of these carry the `[pizarra-ux-overhaul]` subject marker and none were touched by the pizarra verify.
- Working-tree WIP at archive time: 3 modified + 3 untracked paths, all agent-comms-redesign scope (per `git status --short`). The orchestrator's final commit may include these as a separate WIP commit if the user requests, or leave them in the tree for the next change.
- `DEVHUB_BYPASS_BUDGET=1` was used on every pizarra commit because the pre-commit hook's D2 budget guard computes diff vs `origin/feature/session-workspace-restore` (cumulative, 8000+ lines including WIP). The size exception was approved in preflight.

---

## Intent

## Intent

The pizarra (board) tab is supposed to be a first-class surface for arranging
terminals, browsers, and sketches inside DevHub, but it ships with visible
roughness: a hard Konva grid that fights the brutalist style, terminals that
break under drag, a browser that gets stuck on a loading spinner, and elements
that stack on top of each other the moment the user adds a second one. On top
of that, the board and the right-dock workspace are still two separate worlds
that re-implement the same primitives twice. This change ships a **scoped
Phase 1** that fixes the highest-friction symptoms (grid, drag, browser load,
stacking, visual polish) and lays the contract for the unification work
(tabs + bridge) that lands in a follow-up change. The board becomes a surface
the user can actually drive, without blowing the 800-line single-PR budget.

## Scope

### IN (Phase 1, this change)

- **Remove the Konva dot/line grid** from `PizarraCanvas.jsx`; ship a solid
  background. A `NEXT_PUBLIC_PIZARRA_GRID_TEXTURE` env flag keeps a subtle
  non-grid texture opt-in for users who want it.
- **Harden terminal drag** so the recently-extracted
  `usePizarraSurfaceDrag` RAF hook survives rapid drag + zoom + native
  GTK/VTE overlay sync, with regression tests around `totalDeltaX/Y`,
  zoom-aware scaling, and `onNativeSync` invocation count.
- **Fix the stuck-loading symptom** in the pizarra browser surface. The
  "stuck spinner" is the native GTK runtime path never resolving
  `nativeRuntimeReady`; we add a deterministic iframe-fallback gate, an
  error surface when the native runtime errors, and a manual reload path.
- **Stop stacking on creation**: `handleAddElement` in `PizarraPane.jsx`
  offsets the second, third, … element by a deterministic 24px cascade so
  a new terminal and a new browser never occupy the same coordinates.
- **Visual and fluidity polish**: tighten the brutalist palette on
  `PizarraToolPalette` and the right-dock tab strip, add hover/active
  micro-states to terminal/browser headers, eliminate the visible jump
  when the canvas first mounts (no more `LOADING CANVAS...` flash when
  konva is healthy).

### OUT (Phase 1)

- **Bridge / pizarra↔workspace identity unification** (terminals and browsers
  created in one surface appearing as the SAME session in the other).
  Deferred to a dedicated `pizarra-workspace-bridge` change. Reasoning below.
- **Multi-tab browser** (a single browser pane with a tab strip, in both
  the board and the right dock). Deferred. Reasoning below.
- Persistence of board elements across reload (covered separately by
  `pizarra-state-persistence` once the data model converges).
- Native VTE fixes unrelated to drag (font, overlay bounds, scale) — those
  are out of scope here and live in
  `term-04-gtk-vte-multi-panel` / native-terminal-vte-\* references.

## Capabilities

### Modified Capabilities (delta specs)

- `pizarra-canvas`: drop the grid, document the env flag, add stacking
  rule, document polish.
- `canvas-terminal`: pin down the RAF-batched drag contract
  (`usePizarraSurfaceDrag`) and the zoom-aware delta math.
- `browser-preview-lifecycle`: add deterministic fallback when the native
  runtime never resolves `nativeRuntimeReady`, plus the explicit
  manual-reload affordance.
- `browser-preview-responsiveness`: add the iframe-first load path for
  pizarra-mounted browser shapes so the user sees content immediately.

### New Capabilities

- `pizarra-stacking-policy`: deterministic cascade offset for new
  elements.
- `pizarra-grid-environment`: opt-in subtle background texture flag
  (gated by env, not a user setting in this phase).

## Affected Modules

| Path                                                              | Change                 | Symbols / lines                                                                                                                                            |
| ----------------------------------------------------------------- | ---------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/components/pizarra/PizarraCanvas.jsx`                        | Modified               | Drop grid render block (lines 294-319), remove `gridSize` constant, gate texture via `NEXT_PUBLIC_PIZARRA_GRID_TEXTURE`                                    |
| `src/components/pizarra/PizarraPane.jsx`                          | Modified               | `handleAddElement` (lines 132-158) to use a stacking-offset helper; mount-time loading flash removed                                                       |
| `src/components/pizarra/usePizarraSurfaceDrag.js`                 | Modified (already WIP) | Cover edge cases: zero-delta guard, native sync dedupe, RAF cancel on unmount                                                                              |
| `src/components/pizarra/PizarraBrowserSurface.jsx`                | Modified               | Force iframe-first load, add error/reload path, surface a deterministic "loading-failed" state when `nativeRuntimeReady` does not resolve within N seconds |
| `src/components/pizarra/PizarraToolPalette.jsx`                   | Modified               | Hover/active brutalist micro-states, ensure no flash on first mount                                                                                        |
| `src/components/workspace/rightDockState.js`                      | Modified               | Whitelist `pizarra` already present; add `browserLoadFallback` flag for the iframe-first path                                                              |
| `src/lib/pizarra/pizarraReducer.js`                               | Modified               | New action `CASCADE_OFFSET` so the cascade lives in the reducer (testable)                                                                                 |
| `src/lib/pizarra/__tests__/pizarraReducer.test.js`                | New                    | Reducer cascade-offset scenario                                                                                                                            |
| `src/components/pizarra/__tests__/PizarraBrowserSurface.test.jsx` | Modified               | New failing test: "iframe renders within 250ms even if native runtime stalls"                                                                              |
| `src/components/pizarra/__tests__/usePizarraSurfaceDrag.test.js`  | New                    | RAF batching, zoom-aware deltas, native sync dedupe                                                                                                        |
| `src/components/pizarra/__tests__/PizarraPane.cascade.test.jsx`   | New                    | Two `handleAddElement` calls produce non-overlapping coordinates                                                                                           |

Total files touched: **8 source + 4 test files**. Test lines count toward
the budget but are required by strict TDD.

## Current State vs Desired State

- **Grid**: `PizarraCanvas.jsx` (lines 294-319) draws an aggressive
  `rgba(255,255,255,0.04)` line grid inside a `transform: scale()` wrapper.
  The grid is rendered, never honored for snap, and visually competes with
  the brutalist palette. Desired: solid `#1a1f2e` background; an opt-in
  non-grid texture (driven by env) for users who miss the visual rhythm.
- **Drag**: A new `usePizarraSurfaceDrag` hook (WIP, untracked file) was
  extracted to fix native overlay sync. It RAF-batches moves and divides
  by `resolvedZoom`, but lacks coverage for the zero-delta case, double
  unmount, and rapid zoom-mid-drag. Desired: hook covered by unit tests
  on the math + a `requestAnimationFrame` mock, and the existing
  PizarraLiveSurfaceLayer stays unchanged because the live surface layer
  already divides by `resolvedZoom`.
- **Browser stuck loading**: The native GTK runtime shell placeholder
  covers the iframe while `nativeRuntimeReady` is false
  (`WorkspaceBrowserPane.jsx` lines 718-770, per explore observation #3).
  When the runtime never resolves, the user sees a perpetual
  `RefreshCw` spinner. Desired: pizarra-mounted browser shapes use the
  iframe path immediately, and only opt into native when capability +
  readiness both confirm. A timeout escalates to an explicit error with
  a manual reload CTA.
- **Stacking on creation**: `handleAddElement` (lines 132-158) hard-codes
  `canvasCenter = { x: width/2 - 320, y: height/2 - 200 }` for both
  terminal and browser. Desired: a reducer-level `CASCADE_OFFSET` action
  that tracks the last `cascadeIndex` and yields a deterministic
  `(x + 24 * (index % 8), y + 24 * (index % 8))` offset, wrapping so the
  cascade never escapes the viewport.
- **Visual polish**: `PizarraToolPalette` already follows the brutalist
  style; we tighten hover/active states, fix the first-mount flash, and
  add a 1px inner border on the right-dock tab strip so the active tab
  reads at a glance.

## Approach

### Move 1 — Drop the grid, gate the texture

- **What**: Remove the grid `for`-loops and `Line` elements from
  `PizarraCanvas.jsx`. Replace with a solid `background: '#1a1f2e'` (no
  Konva layer for background). Read `process.env.NEXT_PUBLIC_PIZARRA_GRID_TEXTURE`
  once at module scope; when truthy, render a single CSS `background-image:
radial-gradient(...)` on the wrapper at 4% opacity.
- **Why**: The grid is unused for snap and breaks the brutalist style.
  An env flag keeps an opt-in for users who want the texture without
  shipping a settings UI.
- **Files**: `src/components/pizarra/PizarraCanvas.jsx`.
- **TDD**: `src/components/pizarra/__tests__/PizarraCanvas.grid.test.jsx` —
  failing test "renders no Konva Line children when grid is disabled
  (default)", second test "renders CSS background-image when env flag
  is enabled".

### Move 2 — Reducer-driven cascade for new elements

- **What**: Add `PIZARRA_ACTIONS.CASCADE_OFFSET` to `pizarraReducer.js`,
  returning the next available `(x, y)` for `handleAddElement` based on
  `state.cascadeIndex`. Wrap modulo 8 so the cascade stays near center.
  Update `PizarraPane.handleAddElement` to read the cascade from the
  reducer and pass it into `createShape`.
- **Why**: Putting the policy in the reducer keeps it testable in
  isolation and free of DOM measurements. The 24px step matches the
  existing tool palette spacing.
- **Files**: `src/lib/pizarra/pizarraReducer.js`,
  `src/components/pizarra/PizarraPane.jsx`,
  `src/lib/pizarra/__tests__/pizarraReducer.test.js` (new).
- **TDD**: failing test "reducer cascade offset advances by 24px and
  wraps after 8 calls", integration test
  `PizarraPane.cascade.test.jsx` asserting two consecutive
  `handleAddElement` calls produce non-overlapping bounds.

### Move 3 — Harden the drag hook

- **What**: `usePizarraSurfaceDrag` already exists (WIP, untracked). Add
  a zero-delta early return, cancel any pending RAF on unmount, and
  dedupe `onNativeSync` when the resolved position has not changed since
  the last call. Surface `data-testid="pizarra-drag-handle"` on the
  header so RTL can drive it.
- **Why**: The hook is brand new; locking its contract now means
  refactors later don't reintroduce the original "native overlay
  drifts" symptom.
- **Files**: `src/components/pizarra/usePizarraSurfaceDrag.js` (modify
  the WIP file in place; do NOT discard it), new
  `src/components/pizarra/__tests__/usePizarraSurfaceDrag.test.js`.
- **TDD**: failing tests "RAF batches multiple move events into a single
  onMove call", "zero-delta move does not invoke onNativeSync", "unmount
  cancels pending RAF", "delta is divided by resolvedZoom before being
  passed to onMoveElement".

### Move 4 — Iframe-first browser load with explicit fallback

- **What**: In `PizarraBrowserSurface.jsx`, force the initial
  `dockState.browserRuntime` to `'iframe'` and only flip to
  `'native-gtk'` after `useNativeBrowserCapability` reports readiness.
  Add a 5s timeout that flips to a `BrowserLoadFailed` view with a
  manual reload button, and keep the iframe rendered underneath the
  failure state. Pass `browserLoadFallback: true` through
  `rightDockState` so the right-dock path can opt in later.
- **Why**: The pizarra does not need native GTK/VTE for the browser —
  the board's value is layout, not raw WebKit. Removing the race to
  `nativeRuntimeReady` eliminates the top complaint.
- **Files**: `src/components/pizarra/PizarraBrowserSurface.jsx`,
  `src/components/workspace/rightDockState.js` (whitelist the new
  flag), `src/components/pizarra/__tests__/PizarraBrowserSurface.test.jsx`
  (extend the existing WIP-modified file).
- **TDD**: failing test "iframe is rendered on mount with shape.url
  even if native runtime capability is unresolved", "manual reload
  button appears after 5s if native never resolves", "browserRuntime
  flips to native-gtk only after readiness signal".

### Move 5 — Brutalist micro-states and first-mount polish

- **What**: Add a 1px inner border to the right-dock tab strip with
  the existing accent color; explicit hover state for terminal/browser
  headers (border-bottom tint, no transform); replace the
  `LOADING CANVAS...` flash with a single render of the empty canvas
  state by rendering an empty `Stage` skeleton only when
  `konvaLoadError` is true.
- **Why**: Visual continuity with the existing brutalist style of
  `PizarraToolPalette`; eliminates the "did it crash?" moment.
- **Files**: `src/components/pizarra/PizarraToolPalette.jsx`,
  `src/components/pizarra/PizarraCanvas.jsx`,
  `src/components/workspace/WorkspaceRightDock.jsx` (style-only).
- **TDD**: snapshot-style assertions in
  `PizarraToolPalette.test.jsx` for hover/active class names;
  `PizarraCanvas.grid.test.jsx` (from Move 1) also asserts the empty
  state copy when there are no elements.

### Move 6 — Test infra and selector wiring

- **What**: Add a `data-testid="pizarra-canvas"` to the root wrapper in
  `PizarraPane.jsx` and `data-testid="pizarra-add-terminal"` /
  `data-testid="pizarra-add-browser"` to the tool palette buttons. Add
  a tiny `jest.setup.js` shim for `requestAnimationFrame` and
  `cancelAnimationFrame` to ensure `usePizarraSurfaceDrag` tests are
  deterministic.
- **Why**: Strict TDD requires behavior tests, not snapshot tests;
  these IDs are the only way to drive the cascade and drag flows
  without coupling to internals.
- **Files**: `src/components/pizarra/PizarraPane.jsx`,
  `src/components/pizarra/PizarraToolPalette.jsx`,
  `jest.setup.js` (or `tests/setup/`, check repo convention).
- **TDD**: the `usePizarraSurfaceDrag.test.js` and
  `PizarraPane.cascade.test.jsx` suites depend on these selectors; they
  serve as the contract for the rest of the change.

## Tab model decision

**Recommendation: DEFER multi-tab browser to a follow-up change.**

Two paths were considered:

- **(A) Tabs inside a single browser pane**: a new `browserTabs` slice
  on the dock state (`{ tabs: [{id, url, title}], activeTabId }`),
  reused by both `WorkspaceBrowserPane` and `PizarraBrowserSurface`.
  The pizarra would have a tab strip on top of each browser shape;
  the right dock would render the same tab strip in place of the
  single address bar.
- **(B) Separate instances per "tab"**: a tab is just another
  `PizarraBrowserSurface` (current behavior). Cheap to ship, no shared
  state, but creates the exact overlap bug the user is complaining
  about and offers no real "tab" affordance.

Path (A) is the right long-term answer. It is also ~250-400 lines of
shared state plumbing, two near-identical tab-strip components, and
needs the bridge decision to land first so tabs share identity across
the board and the dock. Phase 1 budget (800 lines, single PR) cannot
absorb that. **We keep (B) for Phase 1 with a code comment in
`PizarraBrowserSurface.jsx` marking the path to (A).**

## Bridge model decision

**Recommendation: DEFER pizarra↔workspace identity unification.**

Two paths were considered:

- **(A) Single shared state**: lift the right-dock `dockState` (or
  the pizarra `elements` array) so terminals/browsers created in either
  surface appear in the other. Requires choosing a canonical owner
  (dock vs board) and migrating both `WorkspaceBrowserPane` and
  `PizarraBrowserSurface` to read/write the same source of truth.
- **(B) Identity registry + adapter**: introduce a small
  `surfaceRegistry` map (`{ surfaceId: { type, ref } }`) and an
  `attach`/`detach` API; when the user opens a terminal in the board
  AND it exists in the right dock, the second mount reuses the
  underlying session. The two surfaces still own their visual state.

Path (A) is correct but invasive (~400-600 lines including tests). It
also depends on the tab model landing first so a "tab" in the dock can
be the SAME identity as a "tab" in the board. Phase 1 budget cannot
absorb (A). **Path (B) is the right phase 2 entry point and is what
the follow-up change will adopt.** The Phase 1 WIP work on
`usePizarraSurfaceDrag` and the iframe-first browser path are the
foundation Path (B) will build on.

## Spec deltas needed

- `openspec/changes/pizarra-ux-overhaul/specs/pizarra-canvas/spec.md`
  (delta on `openspec/specs/pizarra-canvas/spec.md`)
  - Capability stem: `pizarra-canvas`
  - New requirements: "Solid canvas background", "Cascade offset for
    new elements", "First-mount polish (no loading flash)".
- `openspec/changes/pizarra-ux-overhaul/specs/canvas-terminal/spec.md`
  (delta on `openspec/specs/canvas-terminal/spec.md` from
  pizarra-terminal-integration)
  - Capability stem: `canvas-terminal`
  - New requirement: "RAF-batched drag hook contract
    (`usePizarraSurfaceDrag`)" with scenarios for batched
    invocation, zero-delta short-circuit, unmount RAF cancel, and
    zoom-aware delta math.
- `openspec/changes/pizarra-ux-overhaul/specs/browser-preview-lifecycle/spec.md`
  (delta on `openspec/specs/browser-preview-lifecycle/spec.md`)
  - Capability stem: `browser-preview-lifecycle`
  - New requirement: "Pizarra browser iframe-first load with
    native-ready opt-in" + "Browser load failure surface".
- `openspec/changes/pizarra-ux-overhaul/specs/browser-preview-responsiveness/spec.md`
  (delta on `openspec/specs/browser-preview-responsiveness/spec.md`)
  - Capability stem: `browser-preview-responsiveness`
  - New requirement: "First contentful paint within 250ms for
    pizarra-mounted browser shapes" (driven by the iframe-first
    change).
- `openspec/changes/pizarra-ux-overhaul/specs/pizarra-grid-environment/spec.md`
  (new spec for the opt-in texture)
  - Capability stem: `pizarra-grid-environment`
  - Requirements: env-flag-driven background texture rendering,
    default-off behavior, no UI exposure in Phase 1.
- `openspec/changes/pizarra-ux-overhaul/specs/pizarra-stacking-policy/spec.md`
  (new spec for the cascade)
  - Capability stem: `pizarra-stacking-policy`
  - Requirements: 24px cascade step, modulo-8 wrap, reducer-driven
    offset computation, deterministic across re-renders.

## Risks

1. **PizarraCanvas still uses `transform: scale(zoom)` on the wrapper**
   (line 330). The Phase 1 grid removal does not touch this, and the
   live surface layer keeps working around it via pre-zoomed bounds.
   If we later fix the zoom implementation (per the
   `pizarra-terminal-integration` design rule "no `transform: scale()`"),
   the new drag hook contract must stay correct. **Mitigation**:
   `usePizarraSurfaceDrag.test.js` is zoom-agnostic at the math layer
   (it asserts `dx/zoom` and `dy/zoom` are passed through), so the
   contract survives a future refactor.
2. **Stale state shape**: `pizarra-state-persistence` spec describes
   `elements: Map` and `viewport: {x,y,zoom}`, but the actual
   `pizarraReducer.js` uses `elements: array` and a separate context
   for zoom/pan. The Phase 1 cascade lives in the reducer, not the
   spec's state shape. **Mitigation**: scope this change to the
   array-based reducer; mark the discrepancy as an explicit follow-up
   for the persistence change to reconcile.
3. **Two parallel pizarra implementations** still exist
   (`src/components/pizarra/*` is live; `src/components/workspace/PizarraPane.jsx`
   and `usePizarraState.js` are dead placeholders). Phase 1 does not
   delete the dead placeholders because they are out of scope and the
   user explicitly asked us not to drift. **Mitigation**: leave a
   `// TODO(pizarra-ux-overhaul): remove dead placeholder once bridge
lands` comment in `src/components/workspace/PizarraPane.jsx`.
4. **BrowserLoadFailed timeout** could fire while the runtime is just
   slow on a cold start, producing a false-positive failure state.
   **Mitigation**: 5s timeout is conservative; manual reload button
   re-arms the timer; documented in the spec.
5. **The dirty working tree is preserved** per the user's explicit
   instruction. The WIP `usePizarraSurfaceDrag.js` (untracked) and
   the 11 modified files are NOT discarded. **Mitigation**: every
   Move above edits in place; nothing `git checkout`s or rebases.

## Rollback plan

Per repo rules in `openspec/config.yaml` (`apply`/`archive` rules):

1. Revert the merge commit (single PR, single revert). All Phase 1
   work is in one PR, so a `git revert <merge-sha>` cleanly
   un-installs it.
2. Restore `usePizarraSurfaceDrag` to the WIP-tracked state if the
   apply step rebased it.
3. Wipe `devhub_pizarra_state:{projectId}` localStorage entries if
   the new `CASCADE_OFFSET` field causes a downstream consumer to
   choke; this is unlikely because the reducer adds the field, not
   consumes it.
4. No DB migrations, no schema changes, no Tauri/Rust changes — so
   the rollback surface is purely the React reducer + components.
5. Verification: the WIP commits `f2e6d0b`, `02a23b4`, `4fca9a9`
   remain reachable at their original SHAs.

## Out of scope (next change)

- **Pizarra↔workspace bridge** (terminal and browser identity
  unification across the two surfaces). Own change:
  `pizarra-workspace-bridge`. Path (B) registry + adapter.
- **Multi-tab browser** in both surfaces. Own change:
  `pizarra-browser-tabs`. Path (A) tab model on dock state.
- **Persistence reconciliation** between
  `pizarra-state-persistence` (Map-shaped spec) and the actual array
  reducer. Own change or rolled into persistence.
- **Dead placeholder cleanup** of `src/components/workspace/PizarraPane.jsx`
  and `src/components/workspace/usePizarraState.js`.
- **Native GTK/VTE browser path** for the board (currently the board
  uses iframe-first; native is opt-in via capability). Revisit when
  the Linux same-window seam lands.
- **`transform: scale()` removal** in `PizarraCanvas.jsx` to align
  with `pizarra-terminal-integration` design rule. Larger refactor;
  needs its own design step.
- **Default browser URL alignment** between `shapeModel.js` (still
  defaults to `localhost:3000`) and `PizarraBrowserSurface` (uses
  `window.location.origin`). Cosmetic, easy to miss in a wider PR.

## Forecast

Conservative estimate for Phase 1 only (counts source + test):

- Move 1 (grid removal + env texture): ~25 lines source + ~35 lines
  tests.
- Move 2 (cascade in reducer): ~30 lines source + ~50 lines tests.
- Move 3 (drag hook hardening): ~30 lines source + ~80 lines tests
  (the hook is the most-tested surface in this change).
- Move 4 (iframe-first browser + failure state): ~80 lines source +
  ~80 lines tests.
- Move 5 (polish): ~50 lines source + ~30 lines tests.
- Move 6 (selectors + jest setup): ~20 lines source + ~0 lines new
  tests (consumed by other suites).
- Spec deltas: ~250 lines of `spec.md` files (not counted in the
  800-line code budget, but the orchestrator should know).
- Buffer for new test failures and incidental refactors: ~75 lines.

**Source + test code total: ~585 lines.** Comfortably under the 800-line
budget. **Forecast headline: ~600 changed lines** for the implementation
PR, with up to ~250 lines of accompanying spec deltas. If a reviewer
pushes back on the spec-vs-impl ratio, the spec deltas can be trimmed
to one delta per modified capability (4 of them) and drop the two new
capability specs from the Phase 1 PR.

## Success criteria

- [ ] No Konva `Line` elements rendered by default in
      `PizarraCanvas.jsx` (test: `PizarraCanvas.grid.test.jsx`).
- [ ] Two consecutive `handleAddElement('terminal')` and
      `handleAddElement('browser')` calls produce non-overlapping bounds
      (test: `PizarraPane.cascade.test.jsx`).
- [ ] `usePizarraSurfaceDrag` RAF-batches moves, divides by zoom,
      short-circuits zero deltas, and cancels RAF on unmount (test:
      `usePizarraSurfaceDrag.test.js`).
- [ ] Pizarra-mounted browser shape renders the iframe within 250ms
      even if the native GTK runtime never reports readiness (test:
      `PizarraBrowserSurface.test.jsx`).
- [ ] After 5s of no `nativeRuntimeReady` signal, the browser
      surface shows an explicit failure state with a manual reload
      button (test: same file).
- [ ] No visible "LOADING CANVAS..." flash on first mount when konva
      loads successfully (visual regression via existing
      `PizarraToolPalette.test.jsx` + a small assertion in the grid
      test).
- [ ] Working tree is clean of accidental WIP discard: every file
      in `git status --short` at the start of the apply step is still
      in `git status --short` (or merged into the apply commits) by the
      end.
- [ ] Single PR on `feature/session-workspace-restore`; no new
      branch; no new worktree.
