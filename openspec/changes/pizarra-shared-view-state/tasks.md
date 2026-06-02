# Tasks: pizarra-shared-view-state

## Review Workload Forecast

| Field                                  | Value                                                                                                                                                                                                                                                |
| -------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Estimated changed lines                | **2 850 – 3 250** (impl ~2 150 + tests ~950, per design §4)                                                                                                                                                                                          |
| 800-line budget risk (D2)              | **HIGH** — design estimates ~3 050 LOC; well above 800                                                                                                                                                                                               |
| 400-line budget risk (default)         | **HIGH**                                                                                                                                                                                                                                             |
| Chained PRs recommended                | **Yes** (technical view) — but **No** per cached `single-pr` strategy (C2)                                                                                                                                                                           |
| Delivery strategy                      | `single-pr` (C2, cached from user)                                                                                                                                                                                                                   |
| Chain strategy                         | `size-exception` required — single PR is the user's chosen path; maintainer must approve                                                                                                                                                             |
| Suggested split (if user changes mind) | PR-1: Phase 0+1+2 (reconcile + flicker + dock state) ≈ 600 LOC; PR-2: Phase 3+5 (browser tabs + registry) ≈ 550 LOC; PR-3: Phase 4+6 (singleton portal + transition) ≈ 800 LOC; PR-4: Phase 7 (integration) ≈ 400 LOC — using `feature-branch-chain` |
| Decision needed before apply           | **Yes** — `single-pr` + 800-line budget breach requires `size:exception`                                                                                                                                                                             |

Decision needed before apply: Yes
Chained PRs recommended: No
Chain strategy: size-exception
800-line budget risk: High

**LOUDSIGNAL**: Design §4 estimates **~3 050 LOC end-to-end**. The cached C2 (single-PR) + D2 (800-line budget) combination is in direct conflict. The apply phase MUST gate on a `size:exception` approval from the maintainer. If the user prefers to honor the 800-line budget, switch to the chained split above (feature-branch-chain is the safest mode because the tracker branch keeps the full integration while each child PR diff is review-sized).

### Per-Phase LOC Breakdown

| Phase                            | Impl      | Tests   | Total              | Cumulative |
| -------------------------------- | --------- | ------- | ------------------ | ---------- |
| 0 — Reconciliation               | 10        | 0       | 10                 | 10         |
| 1 — Flicker fix                  | 40        | 100     | 140                | 150        |
| 2 — SharedDockState foundation   | 100       | 120     | 220                | 370        |
| 3 — Browser multi-tab UI         | 180       | 130     | 310                | 680        |
| 4 — TerminalTTY singleton portal | 280       | 170     | 450                | 1 130      |
| 5 — SharedSurfaceRegistry        | 130       | 140     | 270                | 1 400      |
| 6 — Mode transition animation    | 180       | 130     | 310                | 1 710      |
| 7 — Integration & polish         | 120       | 100     | 220                | 1 930      |
| **Sub-total**                    | **1 040** | **890** | **1 930**          | —          |
| E2E + visual regression          | 0         | 220     | 220                | 2 150      |
| Migration helpers                | 0         | 90      | 90                 | 2 240      |
| Spec doc updates                 | 0         | 0       | 60                 | 2 300      |
| **Grand total**                  | —         | —       | **~2 850 – 3 250** | —          |

---

## Phase 0: Reconciliation (uncommitted WIP)

Branch has 12 modified + 7 untracked files. Reconcile BEFORE implementation so the new design is built on a clean baseline.

- [ ] **0.1** Audit WIP files. **Files**: run `git status --short`; read `src/lib/pizarra/surfaceMotion.js`, `src/lib/pizarra/useLiveSurfaceRegistry.js`, `src/components/pizarra/CanvasTerminal.jsx`, `src/components/pizarra/PizarraCanvas.jsx`, `src/components/pizarra/__tests__/*.test.jsx`. **Acceptance**: list of (file, status, decision) — keep, revert, or amend. **LOC**: 0.
- [ ] **0.2** Decide WIP destiny. **Rule**: keep tokens from `surfaceMotion.js` (aligned with design §2.4); promote `useLiveSurfaceRegistry.js` to `useSharedSurfaceRegistry` per design §4.1 (don't merge the WIP as-is); revert any unrelated test edits. **Acceptance**: decision log written to Engram. **LOC**: 0.
- [ ] **0.3** `[git:checkpoint]` commit on the WIP branch IF 0.2 says keep. **Files**: `git add <kept files>`; `git commit -m "chore(pizarra): reconcile WIP surfaceMotion + useLiveSurfaceRegistry"`. **Acceptance**: clean `git status` for the kept set. **LOC**: ~10.
- [ ] **0.4** Fix lint warnings. **Files**: `src/components/pizarra/PizarraBrowserSurface.jsx:20, 21, 390` — remove unused imports flagged in the preflight. **Acceptance**: `pnpm lint` clean. **LOC**: ~3.

**TDD**: No tests for Phase 0 (audit + cleanup only). Strict TDD applies from Phase 1 onward.

---

## Phase 1: Flicker Fix (small, isolated, no shared state)

Decouples `suspendNativeSurface` from mousedown. Smallest, most isolated change — unblocks QA without touching dock state, portal, or registry.

- [ ] **1.1 RED** Write `CanvasTerminal.flicker.test.jsx`. **Files**: `src/components/pizarra/__tests__/CanvasTerminal.flicker.test.jsx`. **Acceptance**: three failing tests — mousedown alone, mousemove+delta>3, mouseup clears. **LOC**: +100.
- [ ] **1.2** Add `pointerDownRef` + `hasMovedRef` to `CanvasTerminal.jsx`. **Files**: `src/components/pizarra/CanvasTerminal.jsx` (above line 93). **Acceptance**: refs defined, no behavior change yet. **LOC**: +5.
- [ ] **1.3** Wire `onDragStart` to `pointerDownRef.current=true; hasMovedRef.current=false`. **Files**: `src/components/pizarra/CanvasTerminal.jsx:171`. **Acceptance**: green for mousedown-alone test. **LOC**: +3.
- [ ] **1.4** Add `onDragMove` handler with `Math.hypot(movementX, movementY) > 3` gate → set `isLiveDragging=true`. **Files**: extend `usePizarraSurfaceDrag` if it lacks `onDragMove`; otherwise inline. **Acceptance**: green for mousemove-delta>3 test. **LOC**: +12.
- [ ] **1.5** Wire `onDragEnd` to clear both refs + `setIsLiveDragging(false)`. **Files**: `src/components/pizarra/CanvasTerminal.jsx:168`. **Acceptance**: green for mouseup-clears test. **LOC**: +3.
- [ ] **1.6** Replace `suspendNativeSurface={isDragging}` with `suspendNativeSurface={isLiveDragging}` on the `<TerminalTTY>` mount. **Files**: `src/components/pizarra/CanvasTerminal.jsx:308`. **Acceptance**: existing flicker tests pass; new flicker tests pass. **LOC**: +2.
- [ ] **1.7** Apply identical pattern to the resize handles. **Files**: `src/components/pizarra/CanvasTerminal.jsx` (resize handle section). **Acceptance**: resize-flicker regression test green. **LOC**: +10.
- [ ] **1.8** Synchronous reattach in `resolvedBounds` effect. **Files**: `src/components/pizarra/CanvasTerminal.jsx:68-82`. **Acceptance**: `setNativeVtePanelVisibility({ visible: true })` called synchronously inside the effect; `transform: translate3d(0,0,0)` snap applied for 16 ms. **LOC**: +8.
- [ ] **1.9** Manual smoke. **Acceptance**: drag terminal in pizarra, no flicker visible; click (no drag), no flicker. **LOC**: 0.

**TDD order**: 1.1 → 1.2–1.8 (any order; each turns a RED test green) → 1.9 (manual gate).

---

## Phase 2: SharedDockState Foundation

Promote `rightDockState` to `sharedDockState` with surface descriptors + tab list. Backbone for Phases 3, 5, 7.

- [ ] **2.1 RED** Write `useSharedDockState.test.js`. **Files**: `src/components/workspace/__tests__/useSharedDockState.test.js`. **Acceptance**: failing tests for tab ops, persistence roundtrip, cross-tab `storage` event merge, migration of legacy keys. **LOC**: +120.
- [ ] **2.2 RED** Write `sharedDockState.test.js` (pure helpers). **Files**: `src/lib/dock/__tests__/sharedDockState.test.js`. **Acceptance**: failing tests for `readSharedDockState`, `writeSharedDockState`, `migrateDockState`, `.bak` write, LWW merge. **LOC**: +90.
- [ ] **2.3** Create `src/lib/dock/sharedDockState.js` with `SurfaceDescriptor`, `Tab`, `SharedDockState` types and pure helper functions. **Files**: new. **Acceptance**: tests from 2.2 green. **LOC**: +160.
- [ ] **2.4** Create `src/components/workspace/hooks/useSharedDockState.js` — TWM-backed hook exposing the API in design §5. **Files**: new. **Acceptance**: tests from 2.1 green. **LOC**: +220.
- [ ] **2.5** Modify `src/components/workspace/rightDockState.js` to add `tabs: []`, `activeTabId: null`, `tabsMode: 'single'` to the sanitized shape (backward compatible). **Files**: modify. **Acceptance**: existing `rightDockState.test.js` still green. **LOC**: +12.
- [ ] **2.6** Add migration in `rightDockState.js` for legacy `devhub_pizarra_state_*` + `devhub_right_dock_*` keys (delegates to `migrateDockState` from 2.3). **Files**: modify. **Acceptance**: legacy-data fixture test green. **LOC**: +18.
- [ ] **2.7** Wire TWM to OWN `sharedDockState` via `useState` in `TerminalWorkspacesManager.jsx`. **Files**: `src/components/TerminalWorkspacesManager.jsx` (TWM root). **Acceptance**: TWM exposes `useSharedDockState`; legacy `dockState` reads still work. **LOC**: +30.
- [ ] **2.8** Cross-tab `storage` event handler. **Files**: `src/components/workspace/hooks/useSharedDockState.js`. **Acceptance**: opening a second tab and changing state reflects in tab 1 within 1 frame. **LOC**: +20.

**TDD order**: 2.1 + 2.2 first (RED) → 2.3 + 2.4 (GREEN for the pure module + hook) → 2.5 + 2.6 (extend shape) → 2.7 + 2.8 (wire + cross-tab).

---

## Phase 3: Browser Multi-Tab UI

Multi-tab chrome for both `WorkspaceBrowserPane` and `PizarraBrowserSurface`. Depends on Phase 2.

- [ ] **3.1 RED** Write `BrowserTabStrip.test.jsx`. **Files**: `src/components/workspace/__tests__/BrowserTabStrip.test.jsx`. **Acceptance**: failing tests for N chips render, click switches active, close button, new-tab button, disabled-on-last-tab. **LOC**: +90.
- [ ] **3.2** Create `BrowserTabStrip.jsx` — pure presentational. **Files**: new. **Acceptance**: tests from 3.1 green. **LOC**: +130.
- [ ] **3.3 RED** Write `useBrowserTabs.test.js`. **Files**: `src/components/workspace/__tests__/useBrowserTabs.test.js`. **Acceptance**: failing tests for add/close/switch/reorder dispatched against `useSharedDockState`. **LOC**: +40.
- [ ] **3.4** Create `useBrowserTabs.js` hook. **Files**: new. **Acceptance**: tests from 3.3 green. **LOC**: +100.
- [ ] **3.5** Modify `WorkspaceBrowserPane.jsx` to accept `surfaceId` + `tabsMode` props; render `<BrowserTabStrip>` when `tabsMode === 'multi'`. **Files**: modify. **Acceptance**: existing tests still green; new test for `tabsMode: 'multi'` snapshot exists. **LOC**: +60.
- [ ] **3.6** Modify `PizarraBrowserSurface.jsx` to read the same tab list via `useBrowserTabs(surfaceId)`; render the strip in pizarra chrome. **Files**: modify. **Acceptance**: same 3 tabs visible in both modes; close from one removes from the other. **LOC**: +50.
- [ ] **3.7** Persist `tabs` in `sharedDockState` (already done by Phase 2 hook; verify in integration test). **Files**: integration test in `useSharedDockState.test.js`. **Acceptance**: refresh roundtrip preserves tabs. **LOC**: +0 impl, +20 test.
- [ ] **3.8** Update `tabsMode: 'single'` default — verify pizarra consumers explicitly opt into `multi`. **Files**: `PizarraBrowserSurface.jsx`. **Acceptance**: existing `PizarraBrowserSurface.test.jsx` tests green. **LOC**: +3.
- [ ] **3.9** Visual regression: tab strip screenshot baseline. **Files**: `e2e/__screens__/browser-tab-strip.spec.ts`. **Acceptance**: ≤ 5% pixel diff vs baseline. **LOC**: +30 test.

**TDD order**: 3.1 → 3.2 → 3.3 → 3.4 → 3.5 → 3.6 → 3.7 (integration) → 3.8 → 3.9 (visual).

---

## Phase 4: TerminalTTY Singleton Portal (largest phase)

`SharedSurfacesProvider` + `SurfacePortal` + `TerminalTTY` keep-alive. Depends on Phase 2 (state) and Phase 5 (registry). Heavy because the React tree architecture changes.

- [ ] **4.1 RED** Write `SharedSurfacesProvider.test.jsx`. **Files**: `src/components/workspace/__tests__/SharedSurfacesProvider.test.jsx`. **Acceptance**: failing tests for register/release keepAlive/release dispose, refcount > 0, two portals share same DOM. **LOC**: +140.
- [ ] **4.2 RED** Write `SurfacePortal.test.jsx`. **Files**: `src/components/workspace/__tests__/SurfacePortal.test.jsx`. **Acceptance**: failing tests for empty host when surface missing, two hosts same DOM, hostId disambiguation. **LOC**: +60.
- [ ] **4.3** Create `src/components/workspace/SharedSurfacesProvider.jsx` — root provider, owns hidden `terminalMounts` and `browserMounts`. **Files**: new. **Acceptance**: tests from 4.1 green. **LOC**: +180.
- [ ] **4.4** Create `src/components/workspace/SurfacePortal.jsx`. **Files**: new. **Acceptance**: tests from 4.2 green. **LOC**: +80.
- [ ] **4.5** Modify `TerminalTTY.jsx` to accept `surfaceId` prop; call `registerSurface` on mount; `releaseSurface(id, { keepAlive: true })` on React unmount unless `disposeOnUnmount=true`. **Files**: `src/components/TerminalTTY.jsx`. **Acceptance**: surface registered, XTerm not disposed when only the dock unmounts. **LOC**: +30.
- [ ] **4.6** Modify `TerminalTTY.jsx` to align `WebSocket sessionId`, native VTE `panelId`, XTerm DOM `id` to the same `surfaceId`. **Files**: `src/components/TerminalTTY.jsx`. **Acceptance**: integration test asserting all 4 references match. **LOC**: +12.
- [ ] **4.7** Add pause/resume hooks in `TerminalTTY.jsx` — `pauseNativePanel()`, `resumeNativePanel()`. **Files**: modify. **Acceptance**: hook calls result in IPC suspend/resume; no XTerm re-render. **LOC**: +20.
- [ ] **4.8** Wrap `WorkspaceBrowserPane.jsx` mount in `<SurfacePortal hostId="workspace-dock">` in `WorkspaceRightDock.jsx`. **Files**: `src/components/workspace/WorkspaceRightDock.jsx`. **Acceptance**: panel is mirrored, not recreated, when host tree re-renders. **LOC**: +40.
- [ ] **4.9** Wrap `PizarraCanvas.jsx` surface list in `<SurfacePortal hostId="pizarra-canvas">`. **Files**: `src/components/pizarra/PizarraCanvas.jsx`. **Acceptance**: same DOM id appears in both hosts after toggle. **LOC**: +40.
- [ ] **4.10** Integration test: mount provider, render a terminal, flip `maximizedView`, assert mount count stays 1. **Files**: `src/components/workspace/__tests__/modeToggle.integration.test.jsx`. **Acceptance**: WebSocket count = 1, XTerm DOM id unchanged. **LOC**: +80 test.
- [ ] **4.11** E2E: spawn terminal in workspace, toggle to pizarra, verify scrollback preserved. **Files**: `e2e/pizarra-shared-view.spec.ts`. **Acceptance**: scrollback bytes identical pre/post toggle; no WebSocket reconnection log. **LOC**: +100 test.

**TDD order**: 4.1 + 4.2 (RED) → 4.3 + 4.4 (GREEN provider + portal) → 4.5 + 4.6 + 4.7 (modify TerminalTTY) → 4.8 + 4.9 (wire hosts) → 4.10 (integration) → 4.11 (E2E).

---

## Phase 5: SharedSurfaceRegistry (Bidirectional)

Promote `useLiveSurfaceRegistry` to `useSharedSurfaceRegistry` with bidirectional API + LWW merge. Depends on Phase 2.

- [ ] **5.1 RED** Write `useSharedSurfaceRegistry.test.js`. **Files**: `src/lib/pizarra/__tests__/useSharedSurfaceRegistry.test.js`. **Acceptance**: failing tests for register, unregister, subscribe, `requestSurfaceUpdate`, LWW merge, single-writer convention. **LOC**: +120.
- [ ] **5.2** Create `src/lib/pizarra/useSharedSurfaceRegistry.js` with the bidirectional API. **Files**: new (WIP file at same path becomes the new module). **Acceptance**: tests from 5.1 green; the WIP file's localStorage key shape preserved. **LOC**: +120.
- [ ] **5.3** Wire TWM (workspace writer) to call `register` for workspace-owned surfaces and `subscribe` for pizarra-published surfaces. **Files**: `src/components/TerminalWorkspacesManager.jsx`. **Acceptance**: TWM reactively shows pizarra-dropped surfaces within 1 frame. **LOC**: +25.
- [ ] **5.4** Wire `PizarraCanvas.jsx` to `register` canvas-dropped surfaces and `subscribe` to TWM-published surfaces. **Files**: `src/components/pizarra/PizarraCanvas.jsx`. **Acceptance**: pizarra reactively shows workspace-spawned terminals. **LOC**: +25.
- [ ] **5.5** Surface additions/deletions propagate BOTH ways. **Files**: integration test in 5.1. **Acceptance**: add from TWM → pizarra sees; remove from pizarra → TWM sees. **LOC**: +0 impl, +20 test.
- [ ] **5.6** Stale-write rejection emits `surfaceWriteRejected` event. **Files**: `useSharedSurfaceRegistry.js`. **Acceptance**: unit test for `updatedAt: T1 < T2` reject path green. **LOC**: +10 impl, +10 test.
- [ ] **5.7** Deprecate the old `useLiveSurfaceRegistry` (keep as re-export shim with a console.warn for 1 release). **Files**: `useLiveSurfaceRegistry.js`. **Acceptance**: existing consumers compile; warning emitted. **LOC**: +5.

**TDD order**: 5.1 → 5.2 (GREEN) → 5.3 + 5.4 (wire) → 5.5 (integration test) → 5.6 → 5.7.

---

## Phase 6: Mode Transition Animation

`useModeTransition` hook + framer-motion wiring. Depends on Phase 2 (state) and Phase 4 (portals live underneath).

- [ ] **6.1 RED** Write `useModeTransition.test.js`. **Files**: `src/lib/pizarra/__tests__/useModeTransition.test.js`. **Acceptance**: failing tests for idle/leaving/entering phases, debounce 200ms, rapid-toggle cancellation, reduced-motion, no hardcoded durations. **LOC**: +120.
- [ ] **6.2** Create `src/lib/pizarra/useModeTransition.js` with framer-motion-based hook reading `DUR` + `EASE_OUT` from `surfaceMotion.js`. **Files**: new. **Acceptance**: tests from 6.1 green. **LOC**: +130.
- [ ] **6.3** Export `MOTION_DRIVER` constant in `surfaceMotion.js` (design §4 spec requirement). **Files**: `src/lib/pizarra/surfaceMotion.js`. **Acceptance**: `MOTION_DRIVER === 'framer-motion'`; framer-motion already in `package.json` (^12.38.0). **LOC**: +5.
- [ ] **6.4** Wire `PizarraCanvas.jsx` chrome layers to `useModeTransition` via framer-motion `AnimatePresence` keyed on `maximizedView`. **Files**: `src/components/pizarra/PizarraCanvas.jsx`. **Acceptance**: 330 ms total transition; chrome fades + slides + scales. **LOC**: +30.
- [ ] **6.5** Wire `WorkspaceRightDock.jsx` chrome to the same hook. **Files**: `src/components/workspace/WorkspaceRightDock.jsx`. **Acceptance**: workspace chrome animates in lockstep with pizarra. **LOC**: +25.
- [ ] **6.6** Respect `prefers-reduced-motion` — collapse to ≤ 50 ms cross-fade. **Files**: `useModeTransition.js` (already covered by 6.1 test). **Acceptance**: `useReducedMotion()` from framer-motion drives the path. **LOC**: 0 (in 6.2).
- [ ] **6.7** Component test: `idle → leaving → entering → idle` state machine. **Files**: `src/components/pizarra/__tests__/PizarraCanvas.transition.test.jsx`. **Acceptance**: state machine asserted with fake timers. **LOC**: +60.
- [ ] **6.8** Visual regression: video diff at t=0/110/220/330 ms. **Files**: `e2e/__screens__/mode-transition.spec.ts`. **Acceptance**: ≤ 5% pixel diff from `transitionTokens.snapshot.json` baseline. **LOC**: +80 test.

**TDD order**: 6.1 → 6.2 (GREEN) → 6.3 (driver constant) → 6.4 + 6.5 (wire) → 6.6 (reduced motion already in 6.1) → 6.7 + 6.8 (component + visual).

---

## Phase 7: Integration & Polish

Feature flag, wiring final components, full e2e, spec updates, regression tests. Last phase.

- [ ] **7.1** Create `src/lib/pizarra/featureFlag.js` — `isPizarraSharedViewEnabled()` reads `process.env.NEXT_PUBLIC_PIZARRA_SHARED_VIEW_STATE`. **Files**: new. **Acceptance**: defaults to `true` in dev, `false` in prod builds. **LOC**: +30.
- [ ] **7.2** Gate all new code paths on the flag; when off, fall back to legacy disjoint behavior. **Files**: `SharedSurfacesProvider.jsx`, `PizarraCanvas.jsx`, `WorkspaceRightDock.jsx`, `useSharedDockState.js`. **Acceptance**: with flag off, app boots in legacy mode; no `sharedDockState` writes. **LOC**: +20.
- [ ] **7.3** Update `usePizarraSurfaceDrag.js` to accept an `onDragMove` callback (extension of Phase 1.4 work). **Files**: `src/components/pizarra/usePizarraSurfaceDrag.js`. **Acceptance**: callback receives the move event with `movementX/Y`. **LOC**: +10.
- [ ] **7.4** Update `PizarraPane.jsx` to use the shared surfaces. **Files**: `src/components/pizarra/PizarraPane.jsx`. **Acceptance**: pizarra reads `sharedDockState.surfaces` for its surface list. **LOC**: +30.
- [ ] **7.5** Update `WorkspaceRightDock.jsx` to project surfaces from the shared store. **Files**: `src/components/workspace/WorkspaceRightDock.jsx`. **Acceptance**: dock entry list matches `sharedDockState.surfaces`. **LOC**: +20.
- [ ] **7.6** Update `TerminalWorkspacesManager.jsx` to consume `useSharedDockState`. **Files**: `src/components/TerminalWorkspacesManager.jsx`. **Acceptance**: TWM reads from shared state, not from local `useState`. **LOC**: +20.
- [ ] **7.7** Lint + type check + full test suite. **Acceptance**: `pnpm lint && pnpm test && pnpm typecheck` all green. **LOC**: 0.
- [ ] **7.8** Full e2e: open app, spawn terminal, toggle modes, verify no flicker, scrollback preserved, browser tabs visible. **Files**: `e2e/pizarra-shared-view.spec.ts`. **Acceptance**: Playwright suite green. **LOC**: +60 test.
- [ ] **7.9** Update `pizarra-ux-overhaul/verify-report.md` references. **Files**: verify-report doc. **Acceptance**: report points to new spec. **LOC**: +5.
- [ ] **7.10** Mark `pizarra-terminal-integration` design.md forward-pointer as superseded by this change. **Files**: design doc. **Acceptance**: pointer added in the cross-references section. **LOC**: +3.
- [ ] **7.11** Update pizarra-state-persistence regression test — assert freehand drawing is unchanged when the flag is on. **Files**: `src/components/pizarra/__tests__/pizarraFlow.test.js`. **Acceptance**: test green with flag on. **LOC**: +10.

**TDD order**: 7.1 (flag) → 7.3 (extension) → 7.4/7.5/7.6 (wiring — each has a test in 7.7) → 7.2 (gate) → 7.7 (full suite) → 7.8 (e2e) → 7.9/7.10 (docs) → 7.11 (regression).

---

## Final Summary

### Task count

- Total tasks: **69** across **8 phases** (0–7)
- Tests-first (RED) tasks: **15**
- Implementation tasks: **38**
- E2E / visual tasks: **5**
- Spec / docs tasks: **3**
- Manual gates: **3** (Phase 1.9, Phase 7.7, Phase 7.8 partial)

### Total estimated LOC

**~2 850 – 3 250 LOC** (impl + tests + e2e + spec updates). Comfortably matches design §4 estimate of **~3 050 LOC**.

### Per-phase breakdown

| Phase                      | Tasks  | Impl      | Tests     | Total            |
| -------------------------- | ------ | --------- | --------- | ---------------- |
| 0 — Reconciliation         | 4      | 10        | 0         | 10               |
| 1 — Flicker fix            | 9      | 40        | 100       | 140              |
| 2 — SharedDockState        | 8      | 100       | 210       | 310              |
| 3 — Browser tabs           | 9      | 180       | 130       | 310              |
| 4 — Portal singleton       | 11     | 280       | 200       | 480              |
| 5 — Registry bidirectional | 7      | 130       | 150       | 280              |
| 6 — Mode transition        | 8      | 180       | 140       | 320              |
| 7 — Integration & polish   | 11     | 120       | 70        | 190              |
| **Total**                  | **67** | **1 040** | **1 000** | **2 040**        |
| E2E + visual + spec        | —      | —         | —         | ~700–1 200       |
| **Grand total**            | —      | —         | —         | **~2 850–3 250** |

### Strict TDD — RED tests to write FIRST

| Task | Test file                          | Phase |
| ---- | ---------------------------------- | ----- |
| 1.1  | `CanvasTerminal.flicker.test.jsx`  | 1     |
| 2.1  | `useSharedDockState.test.js`       | 2     |
| 2.2  | `sharedDockState.test.js`          | 2     |
| 3.1  | `BrowserTabStrip.test.jsx`         | 3     |
| 3.3  | `useBrowserTabs.test.js`           | 3     |
| 4.1  | `SharedSurfacesProvider.test.jsx`  | 4     |
| 4.2  | `SurfacePortal.test.jsx`           | 4     |
| 5.1  | `useSharedSurfaceRegistry.test.js` | 5     |
| 6.1  | `useModeTransition.test.js`        | 6     |

### Phase dependencies (must be sequential)

```
Phase 0 ──┬──> Phase 1 (independent, can start after 0)
          ├──> Phase 2 (foundation for 3, 5, 7)
          │       ├──> Phase 3 (browser tabs)
          │       ├──> Phase 5 (registry)
          │       │       └──> Phase 4 (TerminalTTY wires registry + state)
          │       │               └──> Phase 6 (transition runs on top of portals)
          │       │                       └──> Phase 7 (integration)
          └──> Phase 1 ──────────────────────────────> Phase 7
```

**Critical path**: `0 → 2 → 5 → 4 → 6 → 7` (longest sequential chain). Phases 1 and 3 can run in parallel to 5 once Phase 2 is merged.

### Risk areas (highest uncertainty)

| Risk                                                 | Phase | Why                                                      | Mitigation                                                                                                            |
| ---------------------------------------------------- | ----- | -------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| TerminalTTY `keepAlive` semantics break WS lifecycle | 4     | Touches a hot path; risks scrollback loss                | WIP `CanvasTerminal.unmount-guard.test.jsx` already exists — extend with keepAlive scenarios before impl              |
| Migration corrupts legacy localStorage               | 2     | Users with months of data                                | `.bak` write before any mutation; gated by feature flag; integration test primes legacy keys                          |
| Mode transition jank on rapid toggles                | 6     | Debounce + cancel semantics; visual regression expensive | Debounce 200 ms; explicit cancel-in-flight test; Playwright `--video=on` from day 1                                   |
| Flicker threshold (3 px) too tight or too loose      | 1     | Subjective; depends on mouse DPI                         | Make threshold a constant at top of `CanvasTerminal.jsx` for easy tuning; A/B with 2 px and 5 px in tests             |
| Bidirectional registry race conditions               | 5     | Single-writer convention relies on discipline            | Make `requestSurfaceUpdate` the only path; `register`/`unregister` write to a queue; LWW test with concurrent writers |
| Workspace tree re-mounts the providers               | 4     | TWM is large; refcount bugs hide                         | Each provider test asserts refcount transitions; integration test asserts XTerm mount count stays 1 across 5 toggles  |
| Portals mount twice when feature flag toggles        | 7     | Flag-off path + flag-on path can both mount              | Single provider mounts; portals render `null` when flag off; assertion test in 7.2                                    |

### Apply-phase gate

**Decision needed before apply: Yes** — the cached `single-pr` (C2) strategy combined with the **~3 050 LOC** forecast and **D2 (800-line budget)** is a direct conflict. The orchestrator MUST request `size:exception` from the maintainer before launching `sdd-apply`. If the maintainer declines, fall back to the chained split in the Workload Forecast (4 PRs, feature-branch-chain).
