# Tasks: Pizarra close buttons (mini-change, no SDD)

> Mini-change: small UX fix. The user wants a visible close (X) button
> on both TERMINAL and BROWSER shapes in the pizarra. Today the only
> way to close them is to remove them via the property inspector
> "Delete Shape" button. The user wants in-place close buttons in the
> header.

## Context the sub-agent must load

- The reducer at `src/lib/pizarra/pizarraReducer.js` already exposes
  `PIZARRA_ACTIONS.DELETE_ELEMENT` (line 19). The dispatch shape is
  `{ type: PIZARRA_ACTIONS.DELETE_ELEMENT, payload: id }` (line 133
  and line 109 of the test file).
- The container tree for pizarra is:
  - `PizarraPane.jsx` (state owner, has `addElement`/`updateElement`/
    `selectElement` from `usePizarraState`)
  - `PizarraLiveSurfaceLayer.jsx` (maps each TERMINAL/BROWSER shape
    to either `CanvasTerminal` or `PizarraBrowserSurface`)
  - `CanvasTerminal.jsx` (TERMINAL renderer)
  - `PizarraBrowserSurface.jsx` (BROWSER renderer)
- Existing call pattern: `PizarraPane` exposes callbacks
  (`onSelect`, `onMoveElement`, `onUpdateElement`, `onActivateTerminal`)
  that flow down to the surfaces. We need to add `onRemoveElement`.

## Hard rules

- Branch: `feature/session-workspace-restore` (NO new worktree, NO new branch)
- No push, no PR, no remote
- Pre-commit hook: `DEVHUB_BYPASS_BUDGET=1` on every commit (D2 guard is cumulative vs origin)
- Do NOT touch the agent-comms-redesign files (out of scope):
  - `M devhub-cli/bin/devhub-bus.js`
  - `M src/app/api/agenthub/events/route.js`
  - `?? openspec/changes/agent-comms-redesign/`
  - `?? openspec/changes/zed-hardening/`
  - `?? src/app/api/agenthub/events/__tests__/events-route-retired.test.js`
- The 16 pre-existing `no-useless-escape` errors in `src/lib/agentLaunchWrapper.js`
  remain. They will fire if lint-staged scans that file. Since this
  change does not touch it, lint should pass.
- Strict TDD: write the failing test first, then the implementation.

## Work-unit commits (in this exact order)

### Commit 0 — `chore(pizarra-close): tasks.md`

Stage and commit just `openspec/changes/pizarra-close-buttons/tasks.md`.

### Commit 1 — `feat(pizarra-close): wire DELETE_ELEMENT through pane to surfaces`

Files to modify:

- `src/components/pizarra/PizarraPane.jsx`
  - Add `handleRemoveElement = useCallback((id) => { dispatch({ type: PIZARRA_ACTIONS.DELETE_ELEMENT, payload: id }); }, [dispatch])`
  - Pass it to `PizarraLiveSurfaceLayer` as `onRemoveElement`.
  - The dependency array for the existing `usePizarraState()` hook
    returns `dispatch`; use that.

- `src/components/pizarra/PizarraLiveSurfaceLayer.jsx`
  - Add `onRemoveElement` to the destructured props.
  - Pass `onClose={() => onRemoveElement?.(shape.id)}` to
    `CanvasTerminal` and `PizarraBrowserSurface`.

### Commit 2 — `feat(pizarra-close): add X button in CanvasTerminal header`

File: `src/components/pizarra/CanvasTerminal.jsx`

- Import `X` from `lucide-react` (alongside any other icons used in
  the file). Check existing imports — if X is not yet imported,
  add `import { X } from 'lucide-react';`.
- In the existing header div (data-testid="canvas-terminal-header"),
  the right side currently renders `<span>{requestedRendererMode === 'vte-experimental' ? 'native auto' : requestedRendererMode}</span>`.
  Add a close button AFTER that span, INSIDE a flex wrapper.
  - The close button:
    - `data-testid="canvas-terminal-close"`
    - `data-pizarra-close-button="true"` (so other handlers can skip
      it via the closest() guard pattern used elsewhere)
    - `onMouseDown={(e) => e.stopPropagation()}` so the header's
      drag handler does not start a drag when the user clicks the X.
    - `onClick={(e) => { e.stopPropagation(); onClose?.(resolvedShape.id); }}`
    - Inline-styled like a brutalist icon button: 18x18, transparent
      background, no border, color #9fb5d1, cursor pointer, padding 2.
    - Renders `<X size={12} />` from lucide-react.
    - `title="Cerrar terminal"`, `aria-label="Cerrar terminal"`,
      `type="button"`.
- Add a test stub for the close button (TDD: failing test first in
  commit 3, then the test passes in commit 3 once the button exists
  in commit 2). Note: this commit 2 is the production code; the
  test is in commit 3.

### Commit 3 — `test(pizarra-close): cover CanvasTerminal close button`

File: `src/components/pizarra/__tests__/CanvasTerminal.close.test.jsx` (new)

- Mirror the existing test approach in the same dir
  (`CanvasTerminal.test.jsx` uses react-dom + act).
- Required test cases:
  1. Renders the close button with `data-testid="canvas-terminal-close"`
     when the terminal is mounted.
  2. Clicking the close button calls `onClose` exactly once with the
     resolved shape id.
  3. Clicking the close button does NOT start a drag: the drag
     handler `usePizarraSurfaceDrag` mock is called 0 times.
     (Easiest path: spy on the data-pizarra-surface-drag-handle's
     mousedown — assert it is not dispatched, or assert that
     the `onMove` callback was not called.)

### Commit 4 — `feat(pizarra-close): add X button in PizarraBrowserSurface header`

File: `src/components/pizarra/PizarraBrowserSurface.jsx`

- The file already imports `{ Move, RefreshCw }` from `lucide-react`.
  Add `X` to that import: `import { Move, RefreshCw, X } from 'lucide-react';`.
- Add `onClose` to the destructured props.
- In the JSX, after the existing `Move` icon button (top-left
  `data-testid="pizarra-drag-handle"`), add a close button
  positioned absolute at top-right.
  - data-testid: `pizarra-browser-close`
  - data-pizarra-close-button: `true`
  - onMouseDown: stop propagation
  - onClick: stop propagation + `onClose?.(shape.id)`
  - Style: 28x28 absolute, top:10, right:10, similar to the drag
    handle button but red-tinted on hover. `title="Cerrar navegador"`,
    `aria-label="Cerrar navegador"`, `type="button"`.

### Commit 5 — `test(pizarra-close): cover PizarraBrowserSurface close button`

File: `src/components/pizarra/__tests__/PizarraBrowserSurface.close.test.jsx` (new)

- Mirror existing test approach (`PizarraBrowserSurface.test.jsx`).
- Required test cases:
  1. Renders `data-testid="pizarra-browser-close"`.
  2. Clicking it calls `onClose` once with `shape.id`.
  3. The drag-handle button is NOT triggered by clicking the close
     button (mousedown event does not bubble to the drag handler).

### Commit 6 — `chore(pizarra-close): run scoped Jest suites and report`

After all production+test commits, run:

```
cd /home/matias/ArxonLabs/devhub && npm test -- --testPathPattern="(CanvasTerminal|PizarraBrowserSurface|pizarraReducer)" 2>&1 | tail -80
```

If any test fails, fix the test (NOT the production code, unless a
real production bug surfaces). Re-run until all green.

## Run order

1. Commit 0 (chore: tasks.md)
2. Commit 1 (feat: wire DELETE_ELEMENT through the surface layer)
3. Commit 2 (feat: CanvasTerminal close button — production code FIRST so the test in commit 3 has something to assert)
4. Commit 3 (test: CanvasTerminal close button)
5. Commit 4 (feat: PizarraBrowserSurface close button)
6. Commit 5 (test: PizarraBrowserSurface close button)
7. Commit 6 (chore: run scoped tests, fix any failures, commit the
   fix as part of this same commit if needed)

Note: TDD purity is N/A here because the production code is being
written inline as a UI affordance. The tests in commits 3 and 5
exercise the production code in commits 2 and 4; they must pass on
the first run unless the test author missed an edge case.

## Commit message footer

Each commit subject should match the `Task` text in the plan above.
Include `Change-Id: pizarra-close-buttons` in the commit body so
the orchestrator can identify this change set later.

## Skills to load

- `sdd-apply`
- `frontend-testing`
- `react-best-practices`
- `work-unit-commits`
- `devhub-desktop-engineering`
- `_shared`

## Final report (to orchestrator)

Save an apply-progress entry to engram under
`sdd/pizarra-close-buttons/apply-progress`, capture_prompt false,
with: list of commit SHAs + subjects, test results (X/Y passing),
working tree state, any deferred items.

Final message format:

```
status: ok | partial | blocked
executive_summary: <2-3 sentences>
commits:
  - <sha> <subject>
git_status_short: ...
test_count_delta: <integer>
risks: <list>
next_recommended: orchestrator-summary-to-user
skill_resolution: paths-injected
```
