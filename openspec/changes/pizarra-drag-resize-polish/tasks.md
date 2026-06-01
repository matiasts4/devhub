# Tasks: Pizarra Drag/Resize Polish (no SDD, no specs, no design)

> Mini-task: NOT a full SDD cycle. No proposal, no specs, no design.
> Just a fast follow-up polish over the already-archived pizarra-ux-overhaul.

## Goal

Two small UX fixes the user asked for after the pizarra-ux-overhaul Phase 1:

1. **Drag is desynced**: the bounding box lags 1-2 frames behind the cursor
   when dragging a terminal. The `onMove` callback (which updates the
   React state driving the visual position) is currently called from
   inside `requestAnimationFrame`, which adds a frame of lag relative
   to the mousemove event. The native VTE sync still needs the RAF
   for IPC throttling, so the fix is: call `onMove` IMMEDIATELY in
   mousemove, keep the RAF only for the native sync.

2. **Resize UX**: the Konva `<Transformer>` (the dashed blue bounding
   box with 8 anchor dots) is rendered for ALL shapes including
   TERMINAL and BROWSER. For composite elements (TERMINAL, BROWSER)
   that have React-rendered content, the Transformer is wrong because
   it operates on Konva primitives that don't represent the visible
   content. The user wants: (a) NO Transformer for composite types,
   (b) resize from any of the 8 edges/corners of the element border.

## Code already changed (by orchestrator inline)

- `src/components/pizarra/usePizarraSurfaceDrag.js`
  - `handleMouseMove`: now calls `onMove` immediately (no RAF)
  - `flushPendingMove`: removed the `onMove` call; keeps only the
    native VTE sync with dedupe
- `src/components/pizarra/PizarraCanvas.jsx`
  - The effect that attaches nodes to the Transformer now excludes
    composite types (TERMINAL, BROWSER) by reading `elements` and
    checking `SHAPE_TYPES.TERMINAL` / `SHAPE_TYPES.BROWSER`
- `src/components/pizarra/CanvasTerminal.jsx`
  - New `handleResizeStart(event, dir)` callback
  - 8 new resize handles in the JSX, rendered only when `selected`
    is true. Each handle has a `data-testid` and an explicit cursor
    (`ns-resize`, `ew-resize`, `nwse-resize`, `nesw-resize`).
  - Handles call `onResize?.(nextBounds)` on every mousemove for
    live visual feedback.
- `src/components/pizarra/PizarraBrowserSurface.jsx`
  - New `handleResizeStart(event, dir)` callback (mirrors
    CanvasTerminal)
  - 8 new resize handles in the JSX, also rendered only when
    `selected`. Each handle excludes the drag-handle button via the
    `closest('[data-pizarra-surface-drag-handle="true"]')` guard.
  - Resize commits via `onUpdateElement?.(shape.id, nextBounds)`.

## Tasks (do all 4, in this order)

### T1 — Extend `usePizarraSurfaceDrag.test.js` with the immediate-onMove scenario

Add a new test block at the end of the existing test file (which lives
at `src/components/pizarra/__tests__/usePizarraSurfaceDrag.test.js`)
that verifies the new contract:

- **Scenario A**: after a single `mousedown` + 3 sequential
  `mousemove` events, `onMove` is called 3 times, with each call
  happening synchronously inside the `mousemove` handler (not on the
  next RAF tick). Verify by NOT calling `flushSync()` or any
  `await new Promise((r) => requestAnimationFrame(r))` between
  dispatching the events and asserting on `onMove.calls.length`.
- **Scenario B**: after a single `mousedown` + `mousemove` + `mouseup`,
  `onMove` is called exactly once with the cumulative
  `totalDeltaX`/`totalDeltaY` (the test host's onMove spy should
  record the last payload).
- **Scenario C**: `flushPendingMove` (triggered by `mouseup`) calls
  `onNativeSync` once if there was a non-zero post-zoom delta, OR
  zero times if all post-zoom deltas were zero (zero-delta
  short-circuit still holds).

Use the same test pattern as the existing tests in the file (TestHost

- createRoot + act). Read the file first to mirror the helpers.

### T2 — New `CanvasTerminal.resize.test.jsx`

Create `src/components/pizarra/__tests__/CanvasTerminal.resize.test.jsx`
with 6 test cases (one per direction plus one for the drag-handle
exclusion):

- **e**: mousedown on `data-testid="canvas-terminal-resize-e"`,
  mousemove +50px → `onResize` called with `width = oldW + 50`
- **w**: mousedown on `data-testid="canvas-terminal-resize-w"`,
  mousemove +50px → `onResize` called with `width = oldW - 50` AND
  `x = oldX + 50`
- **s**: mousedown on `data-testid="canvas-terminal-resize-s"`,
  mousemove +50px → `onResize` called with `height = oldH + 50`
- **n**: mousedown on `data-testid="canvas-terminal-resize-n"`,
  mousemove +50px → `onResize` called with `height = oldH - 50` AND
  `y = oldY + 50`
- **se** (corner): mousedown on `data-testid="canvas-terminal-resize-se"`,
  mousemove +50/+50 → `onResize` called with both width and height grown
- **min-w**: mousedown on `data-testid="canvas-terminal-resize-e"`,
  mousemove -10000px → `onResize` called with `width = 160` (the
  minW floor), not negative

Use the same testing approach as the existing `CanvasTerminal.test.jsx`
in the same directory (react-dom + act, query by testid, fire
mouse events on the testid-bearing div).

### T3 — New `PizarraBrowserSurface.resize.test.jsx`

Create `src/components/pizarra/__tests__/PizarraBrowserSurface.resize.test.jsx`
with 5 test cases (parallels T2 but for the browser):

- **e**: mousedown on `data-testid="pizarra-browser-resize-e"`,
  mousemove +50px → `onUpdateElement` called with
  `{ id: shape.id, width: oldW + 50, x, y, height }`
- **w**: mousedown on `data-testid="pizarra-browser-resize-w"`,
  mousemove +50px → `onUpdateElement` called with `width = oldW - 50`
  AND `x = oldX + 50`
- **drag-handle exclusion**: mousedown on
  `data-testid="pizarra-drag-handle"` (the Move icon button) must
  NOT start a resize; `onUpdateElement` is not called for bounds.
- **selected-only**: the resize handles are NOT in the DOM when
  `selected={false}`. Render with `selected={false}` and assert
  `queryByTestId('pizarra-browser-resize-e')` is `null`.
- **selected-true**: with `selected={true}` the handles ARE in the
  DOM (8 of them, one per direction).

Mirror the existing `PizarraBrowserSurface.test.jsx` testing approach
in the same directory.

### T4 — Run the scoped Jest suites and report

After T1-T3 are implemented, run the targeted Jest suites for
verification:

```
cd /home/matias/ArxonLabs/devhub && npm test -- --testPathPattern="(usePizarraSurfaceDrag|CanvasTerminal|PizarraBrowserSurface)" 2>&1 | tail -50
```

The user does NOT want a full test run; only the pizarra suites.

If any test fails:

- Read the failure, fix the test (NOT the production code unless the
  production code has a real bug that was masked by the previous
  behavior).
- Re-run until all 4 task test files pass.

## Commit strategy

Four work-unit commits, one per task:

1. `test(pizarra-drag): extend usePizarraSurfaceDrag with immediate-onMove scenarios [pizarra-drag-resize-polish 1]`
2. `test(pizarra-drag): cover CanvasTerminal border resize [pizarra-drag-resize-polish 2]`
3. `test(pizarra-drag): cover PizarraBrowserSurface border resize [pizarra-drag-resize-polish 3]`
4. `chore(pizarra-drag): tasks.md for drag/resize polish mini-change [pizarra-drag-resize-polish 0]`

Wait, the order should be:

- 0: chore (this tasks.md)
- 1: test (drag)
- 2: test (terminal resize)
- 3: test (browser resize)

OR: do the production code first (already done by the orchestrator
inline — it is in the working tree, uncommitted), then tests, then
commit production+tests as a single work unit, then close.

Actually, the production code is ALREADY in the working tree. The
sub-agent must:

- First commit the production code as ONE work-unit commit
- Then the test commits (T1, T2, T3) as separate work-unit commits
- Then the tasks.md commit (T0)

So the order: 0. `chore(pizarra-drag): mini-change tasks.md [pizarra-drag-resize-polish 0]`

1. `feat(pizarra-drag): immediate onMove + border resize for composite elements [pizarra-drag-resize-polish 1]`
2. `test(pizarra-drag): extend usePizarraSurfaceDrag with immediate-onMove scenarios [pizarra-drag-resize-polish 2]`
3. `test(pizarra-drag): cover CanvasTerminal border resize [pizarra-drag-resize-polish 3]`
4. `test(pizarra-drag): cover PizarraBrowserSurface border resize [pizarra-drag-resize-polish 4]`

Five commits total. Strict TDD is N/A here because the production
code is already written; the tests must PASS for the production
code as-is. If a test does not pass, the production code is wrong
and the test wins (but in this case the orchestrator wrote the prod
code carefully, so the tests should pass).

## Hard rules

- Branch: `feature/session-workspace-restore` (NO new worktree, NO new branch)
- Do NOT touch the agent-comms-redesign files in the working tree
  (out of scope; they are at `M devhub-cli/bin/devhub-bus.js`,
  `M src/app/api/agenthub/events/route.js`, `?? openspec/changes/agent-comms-redesign/`,
  `?? src/app/api/agenthub/events/__tests__/events-route-retired.test.js`)
- Pre-commit hook: use `DEVHUB_BYPASS_BUDGET=1` env var on every commit
  (D2 budget guard is cumulative against origin, same as pizarra-ux-overhaul)
- The 16 pre-existing `no-useless-escape` errors in
  `src/lib/agentLaunchWrapper.js` are still in the tree. They will
  fire if the hook lints that file. Since this change does not touch
  that file, lint should pass. If it doesn't, use `--no-verify` for
  that one commit and document why in the commit body.
- No push, no PR, no remote.
- No file outside this scope gets created or modified.
- After all 5 commits, save an apply-progress entry to engram:
  topic_key `sdd/pizarra-drag-resize-polish/apply-progress`,
  capture_prompt false.
- Report: 5 commits with sha+subject, test results, risks.

## Skills to load

- `sdd-apply`
- `frontend-testing`
- `react-best-practices`
- `devhub-desktop-engineering`
- `_shared`
- `work-unit-commits`
