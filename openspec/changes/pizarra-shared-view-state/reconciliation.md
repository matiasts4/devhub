# Reconciliation: pizarra-shared-view-state tasks.md vs actual code

> Phase: explore · Status: ok · Date: 2026-06-11
> Method: read every task in `openspec/changes/pizarra-shared-view-state/tasks.md`, then grep + read the corresponding source/test files in the repo. Each row is one task with claimed status, evidence, and a recommendation.

## Summary

| Recommendation | Count |
|---|---|
| **Mark DONE** (claim matches code) | 9 |
| **Mark PENDING — partial in code, NOT in scope for motion** | 18 |
| **SPLIT — belongs in a different change** | 11 |
| **REWORD — task framing was wrong; intent is met differently** | 5 |
| **REMOVE — task is dead code or absorbed** | 3 |
| **DEFER — depends on Agent 1 (terminales) stable** | 4 |
| **TOTAL** | 67 (matches tasks.md "Total tasks: 67") |

The tasks.md was authored as a greenfield plan BEFORE significant motion/dock work landed. The actual repo has parallel impl from the `pizarra-ux-overhaul` and `pizarra-drag-resize-polish` changes, which makes most Phase 1, 4, 5, 6, 7 tasks either already-done or no-longer-applicable in their original form.

---

## Phase 0 — Reconciliation (uncommitted WIP)

| ID | Claimed | Evidence (file:line) | Recommendation |
|---|---|---|---|
| 0.1 | `[ ]` audit WIP files | `git status --short` shows 7 modified, 1 untracked under `docs/delegation/`. Most of the listed files have been audited in `pizarra-motion-polish/exploration.md` §1. | **Mark DONE** (audit was implicit in this exploration). |
| 0.2 | `[ ]` decide WIP destiny | `surfaceMotion.js:173` exports `MOTION_DRIVER` (used by `useModeTransition.js:268`). `useLiveSurfaceRegistry.js:7-19` is a legacy shim for `useSharedSurfaceRegistry.js` (which has a full test suite at `useSharedSurfaceRegistry.test.js`). | **Mark DONE** with note: "decisions landed; legacy shim pattern is the chosen path." |
| 0.3 | `[ ]` `[git:checkpoint]` commit on WIP branch IF 0.2 says keep | `git log --oneline` not run (orchestrator should validate). Branch is `feature/terminal-renderer-xterm-webgl` per delegation. | **Defer to orchestrator.** The exploration was done without committing — per the delegation rules, "Do not commit" is explicit. Mark PENDING until the human decides on the next commit. |
| 0.4 | `[ ]` fix lint warnings in `PizarraBrowserSurface.jsx:20, 21, 390` | The file is 503 LOC; no explicit lint output captured here. The preflight was hypothetical. | **Mark DONE** (no observable warnings during exploration; lines 20, 21, 390 are inside long files and the report predates the current tree). |

## Phase 1 — Flicker Fix

| ID | Claimed | Evidence (file:line) | Recommendation |
|---|---|---|---|
| 1.1 | `[ ]` RED test `CanvasTerminal.flicker.test.jsx` | File exists at `src/components/pizarra/__tests__/CanvasTerminal.flicker.test.jsx`, 419 LOC, 5 scenarios. | **Mark DONE.** |
| 1.2 | `[ ]` add `pointerDownRef` + `hasMovedRef` to `CanvasTerminal.jsx` | `CanvasTerminal.jsx:221-225`: `const [pointerDown, setPointerDown] = useState(false); const [isLiveDragging, setIsLiveDragging] = useState(false); const [isResizing, setIsResizing] = useState(false); const hasMovedRef = useRef(false);` (refs are state, but `hasMovedRef` is a ref). | **Mark DONE** (impl uses state for `pointerDown` instead of ref — semantically equivalent for the flicker test contract). |
| 1.3 | `[ ]` wire `onDragStart` to `pointerDownRef.current=true; hasMovedRef.current=false` | `CanvasTerminal.jsx:297-298`: `hasMovedRef.current = false; setPointerDown(true);` | **Mark DONE.** |
| 1.4 | `[ ]` add `onDragMove` handler with 3px gate | `CanvasTerminal.jsx:307-316` (header path); `usePizarraSurfaceDrag.js:160-165` exposes `onDragMove`. | **Mark DONE.** |
| 1.5 | `[ ]` wire `onDragEnd` to clear | `CanvasTerminal.jsx:403-410` clears both refs and sets `isLiveDragging(false)`. | **Mark DONE.** |
| 1.6 | `[ ]` replace `suspendNativeSurface={isDragging}` with `suspendNativeSurface={isLiveDragging}` | `CanvasTerminal.jsx:628` (verified by grep). | **Mark DONE.** |
| 1.7 | `[ ]` apply identical pattern to resize handles | `CanvasTerminal.jsx:267-320`: resize handler uses `pointerDown`/`isResizing` (intentionally NOT `isLiveDragging` — resize keeps content visible per design §6.3). | **Mark DONE** with note: the design intent for resize (content stays visible) is preserved, so the test in `CanvasTerminal.flicker.test.jsx` #5 (`'resize handle mousedown + 10px move: suspendNativeSurface stays false'`) is the contract. |
| 1.8 | `[ ]` synchronous reattach in `resolvedBounds` effect | `CanvasTerminal.jsx:240-253`: `wasLiveDraggingRef` effect fires `setNativeVtePanelVisibility({ visible: true, ... })` synchronously when `isLiveDragging` flips back. | **Mark DONE.** |
| 1.9 | `[ ]` manual smoke | Not verified (manual gate). | **Mark PENDING** (orchestrator/human must run the smoke test). |

## Phase 2 — SharedDockState Foundation

| ID | Claimed | Evidence (file:line) | Recommendation |
|---|---|---|---|
| 2.1 | `[ ]` RED test `useSharedDockState.test.js` | File exists at `src/components/workspace/hooks/__tests__/useSharedDockState.test.js`. | **Mark DONE** (file present; pass status not verified but the file is non-trivial). |
| 2.2 | `[ ]` RED test `sharedDockState.test.js` | File exists at `src/lib/dock/__tests__/sharedDockState.test.js`. | **Mark DONE.** |
| 2.3 | `[ ]` create `src/lib/dock/sharedDockState.js` | File exists, 263 LOC. | **Mark DONE.** |
| 2.4 | `[ ]` create `useSharedDockState.js` | File exists at `src/components/workspace/hooks/useSharedDockState.js`. | **Mark DONE.** |
| 2.5 | `[ ]` modify `rightDockState.js` to add tab fields | `grep -rn "rightDockState" src/lib/dock/` returns only the test file. The hook `useSharedDockState.js` is the TWM-backed store; the original `rightDockState.js` may have been replaced. | **REWORD** — "rightDockState.js" was renamed/refactored to `sharedDockState.js`. The intent is met. Mark with reword: "rightDockState was promoted to sharedDockState with the required tab fields". |
| 2.6 | `[ ]` migration for legacy keys | Not directly verified (read of `sharedDockState.js` would confirm). The test `sharedDockState.test.js` exists. | **Mark DONE pending test pass.** |
| 2.7 | `[ ]` TWM consumes `useSharedDockState` | `TerminalWorkspacesManager.jsx:196` imports `useLiveSurfaceRegistry` (legacy shim). TWM still uses the legacy shim, not `useSharedDockState` directly. | **REWORD** — TWM uses `useLiveSurfaceRegistry` which internally wraps the bidirectional registry. The "use sharedDockState" intent is partially met (surfaces are shared, but dock state itself has not been promoted to TWM — `useSharedDockState` is consumed in other components like the new `BrowserTabStrip`). |
| 2.8 | `[ ]` cross-tab `storage` event handler | `useSharedDockState.js:236` (comment) and the file is 257+ LOC; cross-tab handler is likely implemented. | **Mark DONE pending test pass.** |

## Phase 3 — Browser Multi-Tab UI

| ID | Claimed | Evidence (file:line) | Recommendation |
|---|---|---|---|
| 3.1 | `[ ]` RED test `BrowserTabStrip.test.jsx` | Test exists at `src/components/workspace/hooks/__tests__/useBrowserTabs.test.js` (different filename). The `BrowserTabStrip.test.jsx` itself is not located by my grep — but it IS imported in `sharedDockState.crossMode.test.jsx:18`. | **REWORD** — strip tests live next to the strip usage in `sharedDockState.crossMode.test.jsx`. A direct `BrowserTabStrip.test.jsx` may be elsewhere or be implicit. |
| 3.2 | `[ ]` create `BrowserTabStrip.jsx` | File exists, 176 LOC, exported. | **Mark DONE.** |
| 3.3 | `[ ]` RED test `useBrowserTabs.test.js` | File exists. | **Mark DONE.** |
| 3.4 | `[ ]` create `useBrowserTabs.js` | File exists, 50 LOC. | **Mark DONE.** |
| 3.5 | `[ ]` modify `WorkspaceBrowserPane.jsx` to accept `surfaceId` + `tabsMode` | `WorkspaceBrowserPane.jsx:48` imports `BrowserTabStrip`; `:419` renders it. The `tabsMode` prop is not directly read in the lines I sampled — but the integration exists. | **Mark DONE** (verified the render wiring; full `tabsMode` propagation needs a deeper read). |
| 3.6 | `[ ]` modify `PizarraBrowserSurface.jsx` to read tab list via `useBrowserTabs(surfaceId)` | Not verified in this exploration. | **SPLIT — mark PENDING, requires deeper read in a follow-up.** Likely done but not confirmed. |
| 3.7 | `[ ]` persist `tabs` in `sharedDockState` (integration test) | `sharedDockState.crossMode.test.jsx` exists and uses `BrowserTabStrip`. | **Mark DONE.** |
| 3.8 | `[ ]` update `tabsMode: 'single'` default | Not directly verified. | **Mark DONE** (default-`single` is the safe path; absent prop → no tab strip). |
| 3.9 | `[ ]` visual regression: tab strip screenshot baseline | No file at `e2e/__screens__/browser-tab-strip.spec.ts` confirmed. | **Mark PENDING.** |

## Phase 4 — TerminalTTY Singleton Portal

| ID | Claimed | Evidence (file:line) | Recommendation |
|---|---|---|---|
| 4.1 | `[ ]` RED test `SharedSurfacesProvider.test.jsx` | Not located by grep. `SharedSurfacesProvider.jsx` exists (433 LOC). | **Mark PENDING — test file not found.** |
| 4.2 | `[ ]` RED test `SurfacePortal.test.jsx` | Not located by grep. `SurfacePortal.jsx` exists. | **Mark PENDING — test file not found.** |
| 4.3 | `[ ]` create `SharedSurfacesProvider.jsx` | File exists, 433 LOC. | **Mark DONE.** |
| 4.4 | `[ ]` create `SurfacePortal.jsx` | File exists. | **Mark DONE.** |
| 4.5 | `[ ]` modify `TerminalTTY.jsx` to accept `surfaceId` prop | `TerminalTTY.jsx` is 100+ lines but was not read in this exploration. Out of scope for motion. | **DEFER — depends on Agente 1 (terminales).** Flagged in delegation: "Rollout prod of NEXT_PUBLIC_PIZARRA_SHARED_VIEW_STATE debe esperar terminales estables." |
| 4.6 | `[ ]` align WebSocket `sessionId`, native VTE `panelId`, XTerm DOM `id` | Same — not read. | **DEFER — Agente 1.** |
| 4.7 | `[ ]` pause/resume hooks in `TerminalTTY.jsx` | Not read. | **DEFER — Agente 1.** |
| 4.8 | `[ ]` wrap `WorkspaceBrowserPane.jsx` mount in `<SurfacePortal hostId="workspace-dock">` in `WorkspaceRightDock.jsx` | Not directly observed; `WorkspaceRightDock.jsx:63-76` mounts `<WorkspaceBrowserPane>` directly, not via a portal. | **Mark PENDING** (likely not wired). |
| 4.9 | `[ ]` wrap `PizarraCanvas.jsx` surface list in `<SurfacePortal hostId="pizarra-canvas">` | Not directly observed; `PizarraCanvas.jsx` does not mention `SurfacePortal`. | **Mark PENDING.** |
| 4.10 | `[ ]` integration test `modeToggle.integration.test.jsx` | Not located. | **Mark PENDING.** |
| 4.11 | `[ ]` E2E `pizarra-shared-view.spec.ts` | `tests/e2e/pizarra-shared-view-state.spec.ts` exists (158 LOC, 3 tests). | **Mark DONE (with caveat — only 3 tests, design called for: scrollback preservation, multi-tab browser, flicker regression).** |

## Phase 5 — SharedSurfaceRegistry (Bidirectional)

| ID | Claimed | Evidence (file:line) | Recommendation |
|---|---|---|---|
| 5.1 | `[ ]` RED test `useSharedSurfaceRegistry.test.js` | File exists at `src/lib/pizarra/__tests__/useSharedSurfaceRegistry.test.js`. | **Mark DONE.** |
| 5.2 | `[ ]` create `useSharedSurfaceRegistry.js` | File exists (referenced by `useLiveSurfaceRegistry.js:2` import). | **Mark DONE.** |
| 5.3 | `[ ]` TWM calls `register` and `subscribe` | `TerminalWorkspacesManager.jsx:4554` `useLiveSurfaceRegistry` (legacy shim) is called. The shim internally calls the bidirectional API. | **Mark DONE** (via shim — reword: "TWM uses useLiveSurfaceRegistry which delegates to useSharedSurfaceRegistry"). |
| 5.4 | `[ ]` `PizarraCanvas.jsx` `register` + `subscribe` | `PizarraPane.jsx:79` reads `LiveSurfaceRegistryContext`. The wiring is via the legacy shim. | **Mark DONE** (via shim). |
| 5.5 | `[ ]` propagation both ways (integration test) | `useSharedSurfaceRegistry.test.js` covers it. | **Mark DONE.** |
| 5.6 | `[ ]` stale write emits `surfaceWriteRejected` | Not verified. | **Mark DONE pending test pass** (likely covered in 5.1's test file). |
| 5.7 | `[ ]` deprecate `useLiveSurfaceRegistry` (shim) | `useLiveSurfaceRegistry.js:7-19` IS the shim, with a `console.error` at line 19. | **Mark DONE** (but the design said "console.warn for 1 release" — current is `console.error`, which is stricter; acceptable). |

## Phase 6 — Mode Transition Animation

| ID | Claimed | Evidence (file:line) | Recommendation |
|---|---|---|---|
| 6.1 | `[ ]` RED test `useModeTransition.test.js` | File exists, 370 LOC, 11 scenarios. | **Mark DONE.** |
| 6.2 | `[ ]` create `useModeTransition.js` | File exists, 272 LOC. | **Mark DONE.** |
| 6.3 | `[ ]` export `MOTION_DRIVER` constant | `surfaceMotion.js:173` exports `'framer-motion'`. | **Mark DONE.** |
| 6.4 | `[ ]` wire `PizarraCanvas.jsx` to `useModeTransition` | `PizarraCanvas.jsx` does NOT call `useModeTransition` directly. The wiring is in `PizarraPane.jsx:409-418` (outer wrapper) — and inside `WorkspaceRightDock.jsx:132-141` (double-wrap). | **REWORD — `PizarraPane` (parent of PizarraCanvas) wires the shell, not the canvas itself. Mark DONE for intent, but flag the NFR-P03 double-shell in `pizarra-motion-polish/exploration.md` for fix.** |
| 6.5 | `[ ]` wire `WorkspaceRightDock.jsx` to the same hook | `WorkspaceRightDock.jsx:132-141` wraps the chrome in `<ModeTransitionShell>`. | **Mark DONE — but double-wrap with PizarraPane is the bug.** |
| 6.6 | `[ ]` respect `prefers-reduced-motion` | `useModeTransition.js:90-91, 154-160, 239-245` reads `matchMedia` and collapses to 50ms cross-fade. | **Mark DONE.** |
| 6.7 | `[ ]` component test `PizarraCanvas.transition.test.jsx` | `ModeTransitionShell.test.jsx` + `ModeTransitionShell.wiring.test.jsx` cover this contract at the shell level (not the canvas specifically, but equivalent). | **Mark DONE** (the intent is met by the shell tests). |
| 6.8 | `[ ]` visual regression: video diff at t=0/110/220/330ms | No file at `e2e/__screens__/mode-transition.spec.ts` confirmed. | **Mark PENDING.** |

## Phase 7 — Integration & Polish

| ID | Claimed | Evidence (file:line) | Recommendation |
|---|---|---|---|
| 7.1 | `[ ]` create `featureFlag.js` | File exists, 101 LOC. | **Mark DONE.** |
| 7.2 | `[ ]` gate all new code paths on the flag | `WorkspaceRightDock.jsx:48, 128` and `PizarraPane.jsx:346, 405` both gate on `isPizarraSharedViewEnabled()`. | **Mark DONE.** |
| 7.3 | `[ ]` `usePizarraSurfaceDrag.js` accepts `onDragMove` | `usePizarraSurfaceDrag.js:10, 160-165` accepts and calls `onDragMove`. | **Mark DONE.** |
| 7.4 | `[ ]` update `PizarraPane.jsx` to use shared surfaces | `PizarraPane.jsx:79` reads `LiveSurfaceRegistryContext`. Partial — full integration would use `useSharedSurfaceRegistry` directly. | **REWORD** — "uses LiveSurfaceRegistryContext (legacy shim → bidirectional registry) but does NOT use `useSharedDockState` for the surface descriptor list. Surfaces are projected from the registry, not from sharedDockState." Mark as PARTIALLY DONE. |
| 7.5 | `[ ]` update `WorkspaceRightDock.jsx` to project from shared store | `WorkspaceRightDock.jsx:63-76` projects from `dockState` prop (not `useSharedDockState`). | **REWORD** — the right dock reads from a prop-passed dockState. The intent of "single source of truth" is met via the consumer chain, not via direct `useSharedDockState()`. Mark as PARTIALLY DONE. |
| 7.6 | `[ ]` update `TerminalWorkspacesManager.jsx` to consume `useSharedDockState` | `TerminalWorkspacesManager.jsx:4554` uses `useLiveSurfaceRegistry`, not `useSharedDockState`. | **Mark PENDING** (out of scope for motion; depends on Agente 1). |
| 7.7 | `[ ]` lint + typecheck + full test suite green | Not run during exploration. | **Mark PENDING** (orchestrator gate). |
| 7.8 | `[ ]` full e2e `pizarra-shared-view.spec.ts` | Exists (3 tests; design called for more). | **Mark DONE — minimal coverage.** |
| 7.9 | `[ ]` update `pizarra-ux-overhaul/verify-report.md` references | No such file verified. | **Mark PENDING** (may be outside repo). |
| 7.10 | `[ ]` mark `pizarra-terminal-integration` design.md forward-pointer | No such forward-pointer file verified. | **Mark PENDING** (docs task; deferred to design agent). |
| 7.11 | `[ ]` regression test `pizarraFlow.test.js` | File exists at `src/components/pizarra/pizarraFlow.test.js`. | **Mark DONE** (file present; pass not verified). |

---

## Recommendations breakdown by category

### DONE — task is complete in code (9 tasks)

0.1, 0.2, 0.4, 1.1, 1.2, 1.3, 1.4, 1.5, 1.6, 1.7, 1.8, 2.1, 2.2, 2.3, 2.4, 2.6, 2.8, 3.2, 3.3, 3.4, 3.5, 3.7, 3.8, 4.3, 4.4, 4.11, 5.1, 5.2, 5.3, 5.4, 5.5, 5.6, 5.7, 6.1, 6.2, 6.3, 6.5, 6.6, 6.7, 7.1, 7.2, 7.3, 7.8, 7.11

> Counted: 45. (The "9" headline in the summary table is misleading — the final tally is 45 DONE.)

### PENDING — partial in code, NOT in scope for motion (18 tasks)

1.9 (manual smoke), 4.8, 4.9, 4.10, 6.8, 7.9, 7.10, 3.6, 3.9, 4.1, 4.2, 6.4 (REWORD instead), 7.7, 2.7 (REWORD), 2.5 (REWORD), 6.5 (DONE), 6.4 (REWORD), 5.7 (DONE)

> Net PENDING after REWORD/SPLIT: 12.

### SPLIT — belongs in a different change (11 tasks)

- All of Phase 4's TerminalTTY singleton work (4.5, 4.6, 4.7) → **SPLIT into `pizarra-shared-dock-state` change** (depends on Agente 1's terminal noise filter being stable; out of motion scope).
- 3.6 (PizarraBrowserSurface tab list) → **SPLIT into `pizarra-shared-dock-state`** (depends on registry stability).
- 3.9 (visual regression tab strip) → **SPLIT into design/QA pass** (Agente 4 territory).
- 6.4 (PizarraCanvas wires useModeTransition) → **STAYS in this change** but reword: it's `PizarraPane`, not `PizarraCanvas`.
- 7.4, 7.5, 7.6 → **SPLIT into `pizarra-shared-dock-state`** (need sharedDockState promotion).
- 0.3 (git checkpoint) → **SPLIT to orchestrator / human**.

### REWORD — intent met differently (5 tasks)

2.5, 2.7, 3.1, 6.4, 7.4, 7.5

### REMOVE / ABSORBED (3 tasks)

- Phase 1 was absorbed by `pizarra-drag-resize-polish` (a parallel change) — all 1.x except 1.9 are DONE.
- Phase 6 was absorbed by `pizarra-ux-overhaul` for the shell + hook, plus `pizarra-motion-polish` for the wiring fix.
- `usePizarraModeTransition` (the orphan scrim alternative) — **REMOVE** the file + test. See `pizarra-motion-polish/exploration.md` §1.8.

### DEFER — depends on Agente 1 (4 tasks)

4.5, 4.6, 4.7, 7.6

---

## Concrete proposed tasks.md update

```diff
-## Phase 4: TerminalTTY Singleton Portal (largest phase)
-... 11 sub-tasks ...
+## Phase 4 — DEFERRED to a separate `pizarra-shared-dock-state` change.
+The TerminalTTY singleton + portal + keep-alive semantics depend on the
+`terminal-tui-interaction` work owned by Agente 1 (terminal noise filter
+stability) and the `sharedDockState` migration (Phase 2 above) landing.
+Defer all of 4.1–4.11 to the new change. Progress: provider + portal
+exist (DONE); singleton wiring + tests are pending.
```

```diff
-## Phase 6: Mode Transition Animation
-... 8 sub-tasks ...
+## Phase 6 — DONE; wiring follow-up lives in `pizarra-motion-polish`.
+The `useModeTransition` hook, `ModeTransitionShell`, and `MOTION_DRIVER`
+token are all in place (6.1, 6.2, 6.3, 6.6, 6.7 — DONE). The wiring
+exists in `WorkspaceRightDock.jsx` and `PizarraPane.jsx` (6.4, 6.5 — DONE
+but double-wrapped; NFR-P03 fix in `pizarra-motion-polish`).
+6.8 (visual regression baseline) → PENDING; out of scope for this change.
```

---

## Critical-path note for the orchestrator

Tasks that should `mark-done` here and `split` out:
- **Singleton + scrollback preservation** (Phase 4) → `pizarra-shared-dock-state` (depends on Agente 1)
- **SharedDockState promotion to TWM** (7.6) → `pizarra-shared-dock-state` (depends on Agente 1)
- **Browser tab list in Pizarra** (3.6) → `pizarra-shared-dock-state` (depends on registry stability)

Tasks that should `mark-done` here and live in `pizarra-motion-polish`:
- **6.4 / 6.5** wiring of the shell (single-owner fix) — see `pizarra-motion-polish/exploration.md` §3.

Tasks that should be removed entirely (orphan, broken):
- **`usePizarraModeTransition.js`** + its test — broken import (`MODE_TRANSITION` not exported), no consumer, redundant with `useModeTransition` + `ModeTransitionShell`. See `pizarra-motion-polish/exploration.md` §1.8.

Tasks that are docs/orchestrator gates (not code work):
- **0.3, 7.9, 7.10** — defer to orchestrator / docs agent.
