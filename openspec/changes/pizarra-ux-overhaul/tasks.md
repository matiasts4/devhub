# Tasks: Pizarra UX Overhaul (Phase 1)

> Branch: `feature/session-workspace-restore`. Working tree WIP MUST be preserved. The untracked `src/components/pizarra/usePizarraSurfaceDrag.js` is the contract surface for task 3.3 — do NOT discard it. Strict TDD: every implementation task ships its failing-then-passing test in the same commit.

## Review Workload Forecast

| Field | Value |
|-------|-------|
| Estimated changed lines (source + new/modified tests) | **~1,030–1,260** |
| New files created | 4 test files |
| Files modified | 7 source + 3 test files |
| 400-line budget risk | **High** |
| 800-line budget risk | **High** |
| Chained PRs recommended | **Yes** |
| Chain strategy | **pending** (orchestrator should ask) |
| Decision needed before apply | **Yes** — forecast exceeds 800-line D2 budget |

```text
Decision needed before apply: Yes
Chained PRs recommended: Yes
Chain strategy: pending
400-line budget risk: High
```

### Justification

The proposal's "~585 lines" forecast under-counts strict-TDD test scaffolding. Honest per-move breakdown: grid drop ~150, drag hook hardening ~330, browser iframe-first ~370, browser chrome ~200, reducer cascade ~180, dock-state ~58, tool palette ~75, tab strip ~55, infra ~30, doc ~5. Strict TDD forces 1.5–2× test-to-source ratio on the most-tested surfaces. **Single-PR total ~1,030–1,260 lines**, exceeding 800.

### Chained PR split (recommendation)

| Slice | Tasks | Scope | Lines |
|-------|-------|-------|-------|
| PR 1 — Foundation | 1.1, 2.1, 2.2 | Test infra + state contracts | ~270 |
| PR 2 — Canvas + drag | 1.2, 1.3, 3.1, 3.2, 3.3, 3.4 | Grid, polish, drag hook, PizarraPane cascade | ~770 |
| PR 3 — Browser + tab strip | 3.5, 3.6, 3.7, 4.1, 5.1, 5.2 | Iframe-first browser, chrome, tab strip, doc, verify | ~660 |

Each slice targets `feature/session-workspace-restore` as a feature-branch chain. PR 2 still exceeds 400 (~770) but is the highest-value slice (drag hook is the new contract).

### Deferral options if `size:exception` is rejected

1. **Defer 3.2 (tool palette micro-states)** → follow-up `pizarra-ui-polish`. Saves ~75 lines.
2. **Defer 3.7 (tab strip 1px border)** → follow-up `pizarra-right-dock-polish`. Saves ~55 lines.
3. **Defer 3.6 (browser chrome — keep only failure surface)** → follow-up `pizarra-browser-chrome`. Saves ~200 lines.

---

## Phase 1: Foundation / Test Infrastructure

- [ ] **1.1** Add `requestAnimationFrame`/`cancelAnimationFrame` shim to `tests/jest.runtime-compat.js`
  - Files: `tests/jest.runtime-compat.js` (modify)
  - Tests: covered by 3.3 ("jest setup provides requestAnimationFrame and cancelAnimationFrame")
  - Deps: —
  - Lines: ~25 source, 0 new tests
  - Commit: `test(jest): add requestAnimationFrame shim for drag-hook determinism`

- [ ] **1.2** Expose `data-testid="pizarra-canvas"`, `pizarra-add-terminal`, `pizarra-add-browser` on `PizarraPane` + `PizarraToolPalette`
  - Files: `src/components/pizarra/PizarraPane.jsx` (root), `src/components/pizarra/PizarraToolPalette.jsx` (element buttons)
  - Tests: asserted in 3.4 ("PizarraPane root carries data-testid", "tool palette exposes add testids")
  - Deps: 1.1
  - Lines: ~8 source, 0 new tests
  - Commit: `test(pizarra): expose canvas + add-button testids`

- [ ] **1.3** Expose `data-testid="pizarra-drag-handle"` on terminal + browser drag handles
  - Files: `src/components/pizarra/PizarraBrowserSurface.jsx` (add on existing button), `src/components/pizarra/CanvasTerminal.jsx` (header)
  - Tests: asserted in 3.3 ("drag handle exposes data-testid")
  - Deps: 1.1
  - Lines: ~4 source, 0 new tests
  - Commit: `test(pizarra): expose drag-handle testid on terminal + browser headers`

## Phase 2: State Contracts (Reducer + Dock State)

- [ ] **2.1** Add `PIZARRA_ACTIONS.CASCADE_OFFSET` + `cascadeIndex` to `pizarraReducer.js`; 8 scenarios in `pizarraReducer.test.js` (new)
  - Files: `src/lib/pizarra/pizarraReducer.js` (modify), `src/lib/pizarra/__tests__/pizarraReducer.test.js` (new)
  - Tests: `CASCADE_OFFSET returns (0, 0) when cascadeIndex is 0`, `…advances by 24px per call`, `…wraps after 8 calls (modulo 8)`, `cascade counter is shared across element types`, `CASCADE_OFFSET is computed without DOM measurement`, `DELETE_ELEMENT does not rewind cascadeIndex`, `reducer state.elements is an array, not a Map`, `reducer state does not contain a viewport key`
  - Spec: `board-element-placement` Req 1 (1, 2, 4, 5) + Req 2 (6, 7); `pizarra-state-persistence` Req 1 + 2
  - Deps: 1.1
  - Lines: ~30 source, ~150 tests
  - Commit: `feat(pizarra): add CASCADE_OFFSET action with modulo-8 wrap`

- [ ] **2.2** Whitelist `browserLoadFallback: boolean` in `rightDockState.js`; 4 scenarios in `rightDockState.test.js`
  - Files: `src/components/workspace/rightDockState.js` (DEFAULT + sanitizer), `src/components/workspace/__tests__/rightDockState.test.js` (extend)
  - Tests: `sanitizeRightDockState preserves browserLoadFallback: true`, `readRightDockState defaults to false when absent`, `coerces non-boolean values to false`, `round-trip via writeRightDockState preserves`
  - Spec: `board-browser-load` Req 5
  - Deps: —
  - Lines: ~8 source, ~50 tests
  - Commit: `feat(dock-state): whitelist browserLoadFallback opt-in flag`

## Phase 3: Surface Implementations

- [ ] **3.1** Drop Konva grid + env-gated `radial-gradient` texture on `PizarraCanvas.jsx`; 5 scenarios in `PizarraCanvas.grid.test.jsx` (new)
  - Files: `src/components/pizarra/PizarraCanvas.jsx` (delete lines 294-319 gridLines, add module-scope env read, replace Layer background)
  - Tests: `renders no Konva Line children when grid is disabled (default)`, `renders CSS background-image when env flag is enabled`, `reads NEXT_PUBLIC_PIZARRA_GRID_TEXTURE exactly once across mounts`, `does not render the loading placeholder when konvaLoadError is false`, `renders the loading placeholder when konvaLoadError is true`
  - Spec: `board-canvas` Req 1 (1, 2, 3) + Req 2 (4, 5)
  - Deps: 1.1
  - Lines: ~30 source, ~120 tests
  - Commit: `feat(pizarra): drop Konva grid, gate texture via env flag`

- [ ] **3.2** Brutalist micro-states on `PizarraToolPalette`; 2 scenarios in `PizarraToolPalette.test.jsx` (extend)
  - Files: `src/components/pizarra/PizarraToolPalette.jsx` (add onMouseEnter/Leave, change border-color, no transform)
  - Tests: `hover state changes border-color without transform`, `active tool renders 1px inset accent border`
  - Spec: `board-canvas` Req 3 (6, 7)
  - Deps: 1.1
  - Lines: ~25 source, ~50 tests
  - Commit: `feat(pizarra): brutalist hover/active micro-states on tool palette`

- [ ] **3.3** Harden `usePizarraSurfaceDrag`: zoom-aware delta, native-sync dedupe, data-testid; 12 scenarios in `usePizarraSurfaceDrag.test.js` (new)
  - Files: `src/components/pizarra/usePizarraSurfaceDrag.js` (modify WIP in place), `src/components/pizarra/__tests__/usePizarraSurfaceDrag.test.js` (new)
  - Tests: `RAF batches multiple move events into a single onMove call`, `mouseup cancels in-flight RAF and clears pendingMoveRef`, `zero-delta move does not invoke onNativeSync`, `stationary cursor does not invoke onNativeSync across 10 frames`, `delta is divided by resolvedZoom before being passed to onMove`, `zoom change mid-drag uses the latest resolvedZoom at flush time`, `unmount cancels pending RAF`, `unmount removes window mousemove and mouseup listeners`, `onNativeSync is deduped by resolved position`, `onNativeSync fires when the resolved position changes`, `drag handle exposes data-testid="pizarra-drag-handle"`, `jest setup provides requestAnimationFrame and cancelAnimationFrame`
  - Spec: `board-terminal-drag` Req 1 (1, 2) + Req 2 (3, 4) + Req 3 (5, 6) + Req 4 (7, 8) + Req 5 (9, 10) + Req 6 (11)
  - Deps: 1.1, 1.3
  - Lines: ~50 source, ~280 tests
  - Commit: `feat(pizarra): harden drag hook with zoom-aware deltas + native-sync dedupe`

- [ ] **3.4** Wire `PizarraPane.handleAddElement` to use reducer cascade; 4 scenarios in `PizarraPane.cascade.test.jsx` (new)
  - Files: `src/components/pizarra/PizarraPane.jsx` (modify handleAddElement to dispatch CASCADE_OFFSET then ADD_ELEMENT)
  - Tests: `two handleAddElement calls produce non-overlapping bounds`, `add buttons dispatch CASCADE_OFFSET then ADD_ELEMENT`, `PizarraPane root carries data-testid="pizarra-canvas"`, `tool palette exposes pizarra-add-terminal and pizarra-add-browser testids`
  - Spec: `board-element-placement` Req 1 (3) + Req 3 (8); `board-canvas` Req 4 (8, 9)
  - Deps: 1.2, 2.1
  - Lines: ~30 source, ~150 tests
  - Commit: `feat(pizarra): wire cascade to handleAddElement with reducer-derived offset`

- [ ] **3.5** Iframe-first mount + 5s timeout + failure surface on `PizarraBrowserSurface.jsx`; 10 scenarios in `PizarraBrowserSurface.test.jsx` (extend existing WIP)
  - Files: `src/components/pizarra/PizarraBrowserSurface.jsx` (rewrite createDockState to `browserRuntime: 'iframe'` + `browserLoadFallback: true`; add 5s timer; `BrowserLoadFailed` view; 3 failure categories)
  - Tests: `iframe renders within 250ms even if native runtime stalls`, `browserRuntime flips to native-gtk only after readiness signal`, `browserLoadFallback=true prevents native-gtk opt-in`, `manual reload button appears after 5s if native never resolves`, `reload button re-arms the 5s timer and resets iframe src`, `successful iframe load cancels the 5s failure timer`, `native runtime error triggers BrowserLoadFailed with native-error category`, `native-supported but never-ready triggers native-timeout failure`, `iframe is in DOM within 250ms of mount (FCP target)`, `dockState.browserLoadFallback persists through createDockState`
  - Spec: `board-browser-load` Req 1 (1, 2, 3) + Req 2 (4, 5, 6) + Req 3 (7, 8) + Req 4 (9)
  - Deps: 2.2
  - Lines: ~120 source, ~250 tests
  - Commit: `feat(pizarra-browser): iframe-first mount with 5s explicit failure surface`

- [ ] **3.6** Browser pane chrome: address bar, refresh button, load indicator; 9 scenarios in `PizarraBrowserSurface.test.jsx` (extend)
  - Files: `src/components/pizarra/PizarraBrowserSurface.jsx` (add `<input>` address bar bound to `dockState.browserUrl`; `RefreshCw` button + 3-state load indicator; header hover/active micro-states)
  - Tests: `address bar value matches shape.url on mount`, `Enter in address bar calls commitBrowserNavigation`, `refresh button reloads iframe and preserves history`, `refresh button hover and active states match brutalist style`, `header shows RefreshCw spinner when isLoading is true`, `header hides spinner when isLoading is false`, `BrowserLoadFailed renders in pane body when load fails`, `header hover changes border-bottom-color without transform`, `refresh button mousedown renders 1px inset accent border`
  - Spec: `board-browser-pane` Req 1 (1, 2) + Req 2 (3, 4) + Req 3 (5, 6, 7) + Req 4 (8, 9)
  - Deps: 3.5
  - Lines: ~50 source, ~150 tests
  - Commit: `feat(pizarra-browser): address bar, refresh button, load-state indicator`

- [ ] **3.7** Right-dock tab strip 1px inner border; 2 scenarios in `TerminalWorkspacesManager.right-dock.test.jsx` (extend existing)
  - Files: `src/components/TerminalWorkspacesManager.jsx` (modify tab buttons lines 3746-3806 — **NOTE**: design §3.5 says `WorkspaceRightDock.jsx` but the actual tab strip lives here. Task edits the correct file.)
  - Tests: `active tab in right-dock tab strip has 1px accent inner border`, `inactive tabs in right-dock tab strip do not have accent border`
  - Spec: `board-browser-pane` Req 5 (10, 11)
  - Deps: —
  - Lines: ~15 source, ~40 tests
  - Commit: `feat(right-dock): 1px accent inner border on active tab`

## Phase 4: Documentation / Spec Alignment

- [ ] **4.1** Add `TODO(pizarra-ux-overhaul)` marker to in-flight `pizarra-state-persistence` change (doc-only)
  - Files: `openspec/changes/pizarra-state-persistence/design.md` (forward-pointer comment block)
  - Tests: none (doc review)
  - Spec: `pizarra-state-persistence` Req 3
  - Deps: 2.1
  - Lines: 0 source, 0 tests, ~5 spec lines
  - Commit: `docs(pizarra): mark array-shaped reducer as source of truth`

## Phase 5: Verification

- [ ] **5.1** Run `npm test`; confirm all new/modified suites pass
  - Deps: all 3.x + 1.x
  - Commit: `chore(test): verify pizarra-ux-overhaul suites green`

- [ ] **5.2** Verify working-tree WIP preserved (`git status --short` matches start: 11 modified + 1 untracked `usePizarraSurfaceDrag.js`)
  - Deps: 5.1
  - Commit: (no commit; verification step)

---

## Spec Coverage Matrix

| Stem | Scenarios covered | Tasks |
|------|-------------------|-------|
| `board-canvas` | 10/10 (Req 1 × 3, Req 2 × 2, Req 3 × 2, Req 4 × 3) | 1.1, 1.2, 3.1, 3.2, 3.3, 3.4 |
| `board-element-placement` | 8/8 (Req 1 × 5, Req 2 × 2, Req 3 × 1) | 2.1, 3.4 |
| `board-terminal-drag` | 11/11 (Req 1–6) | 1.1, 1.3, 3.3 |
| `board-browser-load` | 10/10 (Req 1 × 3, Req 2 × 3, Req 3 × 2, Req 4 × 1, Req 5 × 1) | 2.2, 3.5 |
| `board-browser-pane` | 11/11 (Req 1 × 2, Req 2 × 2, Req 3 × 3, Req 4 × 2, Req 5 × 2) | 3.6, 3.7 |
| `pizarra-state-persistence` | 2/3 (Req 1, Req 2 — Req 3 is doc-only) | 2.1, 4.1 |
| **Total** | **52/52 (100%)** | |

## Notes for the orchestrator

1. **Design-doc drift on the tab strip**: design §3.5 says `WorkspaceRightDock.jsx` for the 1px border, but the actual code is in `src/components/TerminalWorkspacesManager.jsx` lines 3746-3806. Task 3.7 edits the correct file; the design doc should be patched at archive time.
2. **WIP preservation**: tasks 1.3, 3.3, 3.4, 3.5, 3.6 all touch dirty-tree files (`CanvasTerminal.jsx`, `PizarraBrowserSurface.jsx`, `usePizarraSurfaceDrag.js`). Edits in place; no rebase, no `git checkout`. WIP commits `f2e6d0b`, `02a23b4`, `4fca9a9` stay reachable.
3. **Forecast honesty**: ~1,030–1,260 lines exceeds 800-line D2 budget. Chained-PR split above keeps slices under 800 (PR 2 is the lone exception at ~770). Deferral section names concrete cuts.
4. **No code written, no commits made, no branch switched.** This file is the only output.
